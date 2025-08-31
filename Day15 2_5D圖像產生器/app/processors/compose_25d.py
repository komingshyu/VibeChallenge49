# app/processors/compose_25d.py
from __future__ import annotations
import os, io, base64
from typing import List, Dict, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

BASE_OUT = os.path.join("data", "outputs")

def ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)

def normalize_depth(d: np.ndarray) -> np.ndarray:
    d = d.astype(np.float32)
    dmin, dmax = float(d.min()), float(d.max())
    if dmax - dmin > 1e-6:
        d = (d - dmin) / (dmax - dmin)
    return np.clip(d, 0, 1)

def _pil(img: np.ndarray, mode: Optional[str] = None) -> Image.Image:
    if img.dtype != np.uint8:
        img = np.clip(img, 0, 255).astype(np.uint8)
    if mode is None:
        if img.ndim == 2: mode = "L"
        elif img.shape[2] == 3: mode = "RGB"
        elif img.shape[2] == 4: mode = "RGBA"
        else: raise ValueError(f"bad shape {img.shape}")
    return Image.fromarray(img, mode)

def _png_b64(img: Image.Image) -> str:
    bio = io.BytesIO(); img.save(bio, format="PNG")
    return base64.b64encode(bio.getvalue()).decode("ascii")

def _bbox_from_mask(mask_u8: np.ndarray) -> Tuple[int,int,int,int]:
    ys, xs = np.where(mask_u8 > 0)
    if xs.size == 0: return 0,0,0,0
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    return x0, y0, x1, y1

def _auto_feather_px(w: int, h: int, base: int) -> int:
    # 以短邊 1024 為基準做自適應
    k = min(w, h) / 1024.0
    return max(1, int(round(base * max(0.8, min(1.6, k)))))

def _alpha_inward_only(mask_u8: np.ndarray, feather_px: int) -> np.ndarray:
    """
    產生只往『內側』過渡的 alpha：
      - 外部：0
      - 邊緣內側 ~ feather_px：從 0 緩升到 1
      - 內部更深處：1
    做法：對「物體=非零」的二值 mask 做 distanceTransform，
          這會對『物體像素』回傳到最近 0（背景）像素的距離（像素）。
    """
    m01 = (mask_u8 > 0).astype(np.uint8)
    # 內距（在物體內部的距離；邊界為 0）
    di = cv2.distanceTransform(m01, cv2.DIST_L2, 3)  # float32
    # 正規化到 0..1（feather_px 以內做過渡）
    f = max(1.0, float(feather_px))
    a = np.clip(di / f, 0.0, 1.0)
    # 外部（m01==0）強制為 0，保證「只往內」
    a[m01 == 0] = 0.0
    return (a * 255.0 + 0.5).astype(np.uint8)

def _alpha_with_outward_ring(mask_u8: np.ndarray, ring_px: int, ring_alpha: float, feather_px: int) -> np.ndarray:
    """
    舊式：在外部擴張一圈半透明 + 全域羽化（會受背景移動影響，非推薦）。
    保留下來供相容；預設請用 _alpha_inward_only。
    """
    m01 = (mask_u8 > 0).astype(np.uint8)
    alpha = (m01 * 255).astype(np.uint8)

    if ring_px > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ring_px*2+1, ring_px*2+1))
        dil = cv2.dilate(m01, k)
        ring = ((dil > 0) & (m01 == 0))
        alpha[ring] = int(np.clip(ring_alpha, 0, 1) * 255)

    if feather_px > 0:
        ksz = max(1, int(feather_px) * 2 + 1)
        alpha = cv2.GaussianBlur(alpha, (ksz, ksz), feather_px)
    return alpha

def rgba_from_rgb_and_mask_alpha_only(
    rgb: np.ndarray,
    mask_u8: np.ndarray,
    *,
    ring_px: int = 0,
    ring_alpha: float = 0.45,
    feather_px: int = 3,
    premultiply: bool = False,
    bg_rgb: Optional[np.ndarray] = None  # 仍保留參數以相容，但這版不需要
) -> Image.Image:
    """
    建立 RGBA 前景。
    預設改為『只往內』羽化，徹底避免外擴半透明造成的背景錯色與鋸齒。
    若 ring_px>0，會回退到舊式（外擴 + 全域羽化）。
    """
    h, w, _ = rgb.shape
    feather_px = _auto_feather_px(w, h, feather_px)  # 對高解析做輕自適應

    if ring_px > 0:
        alpha = _alpha_with_outward_ring(mask_u8, ring_px, ring_alpha, feather_px)
    else:
        alpha = _alpha_inward_only(mask_u8, feather_px)

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = rgb  # 內部顏色保持原圖
    if premultiply:
        a = (alpha.astype(np.float32) / 255.0)[..., None]
        rgba[..., :3] = (rgba[..., :3].astype(np.float32) * a + 0.5).astype(np.uint8)
    rgba[..., 3] = alpha
    return _pil(rgba, "RGBA")

def mean_depth_for_mask(depth01: np.ndarray, mask_u8: np.ndarray, fallback: float = 0.5) -> float:
    m = mask_u8 > 0
    if not np.any(m): return float(fallback)
    v = depth01[m]
    if v.size == 0: return float(fallback)
    md = float(np.nanmean(v))
    if not np.isfinite(md): md = float(fallback)
    return float(np.clip(md, 0.0, 1.0))

def build_instances_payload(
    task_id: str,
    img_rgb: np.ndarray,
    depth01: np.ndarray,
    instances: List[Dict],
    *,
    ring_px: int = 0,
    ring_alpha: float = 0.45,
    feather_px: int = 3,
    premultiply: bool = False,
    bg_rgb: Optional[np.ndarray] = None
) -> List[Dict]:
    H, W = img_rgb.shape[:2]
    out_dir = os.path.join(BASE_OUT, str(task_id)); ensure_dir(out_dir)
    payload: List[Dict] = []

    for i, inst in enumerate(instances):
        mu = inst.get("mask")
        if mu is None: continue
        if mu.dtype != np.uint8: mu = (mu > 0).astype(np.uint8) * 255

        mask_path = os.path.join(out_dir, f"mask_{i:02d}.png")
        _pil(mu, "L").save(mask_path, "PNG")

        rgba_img = rgba_from_rgb_and_mask_alpha_only(
            img_rgb, mu,
            ring_px=ring_px,
            ring_alpha=ring_alpha,
            feather_px=feather_px,
            premultiply=premultiply,
            bg_rgb=bg_rgb
        )
        rgba_path = os.path.join(out_dir, f"fg_{i:02d}.png")
        rgba_img.save(rgba_path, "PNG")

        md = mean_depth_for_mask(depth01, mu, fallback=0.5)

        bbox = inst.get("bbox")
        if bbox and all(k in bbox for k in ("x0","y0","x1","y1")):
            x0 = float(bbox["x0"]) * W if bbox["x0"] <= 1.01 else float(bbox["x0"])
            y0 = float(bbox["y0"]) * H if bbox["y0"] <= 1.01 else float(bbox["y0"])
            x1 = float(bbox["x1"]) * W if bbox["x1"] <= 1.01 else float(bbox["x1"])
            y1 = float(bbox["y1"]) * H if bbox["y1"] <= 1.01 else float(bbox["y1"])
        else:
            x0, y0, x1, y1 = _bbox_from_mask(mu)

        cx = (x0 + x1) / 2.0 / W
        cy = (y0 + y1) / 2.0 / H
        bbox_norm = {"x0": x0 / W, "y0": y0 / H, "x1": x1 / W, "y1": y1 / H}

        payload.append({
            "id": int(inst.get("id", i)),
            "img_b64": _png_b64(rgba_img),
            "mean_depth": float(md),
            "anchor": {"x": float(cx), "y": float(cy)},
            "bbox": bbox_norm
        })

    return payload

def save_intermediates(task_id: str, original: Image.Image, depth01: np.ndarray, union_mask_u8: np.ndarray) -> None:
    out_dir = os.path.join(BASE_OUT, str(task_id)); ensure_dir(out_dir)
    original.convert("RGB").save(os.path.join(out_dir, "original.png"), "PNG")
    _pil((np.clip(depth01,0,1)*255).astype(np.uint8), "L").save(os.path.join(out_dir, "depth.png"), "PNG")
    _pil(union_mask_u8, "L").save(os.path.join(out_dir, "mask_union.png"), "PNG")

def build_final_payload(
    task_id: str,
    bg_img: Image.Image,
    depth01: np.ndarray,
    instances_payload: List[Dict]
) -> Dict:
    out_dir = os.path.join(BASE_OUT, str(task_id)); ensure_dir(out_dir)
    if bg_img.mode != "RGB": bg_img = bg_img.convert("RGB")
    bg_img.save(os.path.join(out_dir, "bg.png"), "PNG")
    depth_img = _pil((np.clip(depth01,0,1)*255).astype(np.uint8), "L")
    depth_img.save(os.path.join(out_dir, "depth.png"), "PNG")
    return {
        "bg_b64": _png_b64(bg_img),
        "depth_b64": _png_b64(depth_img),
        "instances": instances_payload
    }
