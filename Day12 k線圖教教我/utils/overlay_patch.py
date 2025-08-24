
"""
Outline-only bbox overlay patch for K線圖教教我
- Replaces utils.plotting.overlay_bboxes_on_image to draw OUTLINES (no fill).
- Adds thin stroked labels (white text with black stroke) for readability without color blocks.
"""
from typing import List, Dict
import io
try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:
    Image = None
    ImageDraw = None
    ImageFont = None

COLOR_MAP = {
    "支撐": (56, 142, 60, 255),      # green
    "阻力": (251, 140, 0, 255),      # orange
    "均線": (229, 57, 53, 255),      # red
    "趨勢": (30, 136, 229, 255),     # blue
    "缺口": (142, 36, 170, 255),     # purple
    "K棒形態": (233, 30, 99, 255),   # pink
    "量價背離": (2, 136, 209, 255),  # cyan
    "其他": (66, 66, 66, 255),       # gray
}

def _clamp01(x: float) -> float:
    try:
        x = float(x)
    except Exception:
        return 0.0
    return max(0.0, min(1.0, x))

def _to_px_box(bbox: Dict, W: int, H: int):
    x = _clamp01(bbox.get("x", 0.0))
    y = _clamp01(bbox.get("y", 0.0))
    w = _clamp01(bbox.get("w", 0.1))
    h = _clamp01(bbox.get("h", 0.1))
    x0 = int(round(x * W))
    y0 = int(round(y * H))
    x1 = int(round((x + w) * W))
    y1 = int(round((y + h) * H))
    # ensure within image
    x0 = max(0, min(W-1, x0)); x1 = max(0, min(W-1, x1))
    y0 = max(0, min(H-1, y0)); y1 = max(0, min(H-1, y1))
    if x1 <= x0: x1 = min(W-1, x0 + 1)
    if y1 <= y0: y1 = min(H-1, y0 + 1)
    return x0, y0, x1, y1

def overlay_bboxes_on_image_outline(png_bytes: bytes, items: List[Dict], with_label: bool = True) -> bytes:
    if Image is None:
        # If PIL is unavailable, just return original bytes.
        return png_bytes
    im = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    W, H = im.size
    draw = ImageDraw.Draw(im)

    # Thickness relative to size (kept modest so it doesn't shout)
    t = max(2, int(round(min(W, H) * 0.004)))

    # Try to pick a default font; fallback to PIL default if unavailable
    font = None
    try:
        # Use a reasonably common sans if available
        font = ImageFont.truetype("arial.ttf", max(12, int(H * 0.022)))
    except Exception:
        try:
            font = ImageFont.truetype("NotoSansCJK-Regular.ttc", max(12, int(H * 0.022)))
        except Exception:
            try:
                font = ImageFont.truetype("MSJH.ttc", max(12, int(H * 0.022)))  # Microsoft JhengHei
            except Exception:
                font = ImageFont.load_default()

    for idx, it in enumerate(items, 1):
        bbox = (it or {}).get("bbox", {}) or {}
        typ  = (it or {}).get("type", "其他") or "其他"
        title= (it or {}).get("title", "") or typ
        color = COLOR_MAP.get(typ, COLOR_MAP["其他"])

        x0, y0, x1, y1 = _to_px_box(bbox, W, H)
        # outline rectangle (no fill)
        draw.rectangle([x0, y0, x1, y1], outline=color, width=t)

        if with_label:
            # label at top-left corner inside the box; stroked text to ensure readability
            label = f"{idx}. {title}"
            # Slight padding
            tx, ty = x0 + t + 2, y0 + t + 2
            try:
                # Stroke text (white fill, black stroke)
                draw.text((tx, ty), label, font=font, fill=(255, 255, 255, 255),
                          stroke_width=max(1, t//2), stroke_fill=(0, 0, 0, 230))
            except TypeError:
                # Older Pillow without stroke: draw shadow then white
                shadow = (0,0,0,180)
                for dx, dy in ((1,1),(1,-1),(-1,1),(-1,-1)):
                    draw.text((tx+dx, ty+dy), label, font=font, fill=shadow)
                draw.text((tx, ty), label, font=font, fill=(255,255,255,255))

    out = io.BytesIO()
    im.save(out, format="PNG")
    return out.getvalue()

def apply_overlay_outline_patch():
    """
    Replace utils.plotting.overlay_bboxes_on_image with outline-only version.
    Must be called before first use; app/app.py will import and call this.
    """
    try:
        from utils import plotting as _p
        _p.overlay_bboxes_on_image = overlay_bboxes_on_image_outline
    except Exception:
        # Non-fatal: if module path differs, leave original implementation.
        pass
