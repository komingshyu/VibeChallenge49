# app/main.py  —— minimal change 版（保留既有 API / 事件 / I/O）
import os, io, json, base64, asyncio, logging, sys
from typing import Dict
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from PIL import Image
import numpy as np
import cv2
from dotenv import load_dotenv

from .processors.utils import ensure_dirs, SSEQueue, unique_id, resize_to_supported_size
from .processors.depth_anything_ort import compute_depth_map
from .processors.yolo11_seg import load_yolo11_seg, person_instances, union_mask
from .processors.gpt_image import stream_repaint_single_image_responses
from .processors.compose_25d import (
    normalize_depth,          # 深度 0..1 正規化
    build_instances_payload,  # 依遮罩產 RGBA（只外推透明度）並存檔
    build_final_payload,      # 組 final payload 並存 bg/depth
    save_intermediates        # 可選：把四格過程圖也落地
)
load_dotenv()

LOG_DIR = os.path.join(os.path.dirname(__file__), "../logs"); os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout), logging.FileHandler(os.path.join(LOG_DIR, "server.log"), encoding="utf-8")])
logger = logging.getLogger("2p5d")

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
UPLOAD_DIR = os.path.join(ROOT, "../data/uploads")
ensure_dirs(UPLOAD_DIR)
OUTPUT_DIR = os.path.join(ROOT, "../data/outputs")
ensure_dirs(OUTPUT_DIR)

DEPTH_ONNX = os.getenv("DEPTH_ANYTHING_ONNX", "./models/DepthAnything/depth_anything_vitl.onnx")
YOLO_ONNX = os.getenv("YOLO11M_SEG_ONNX", "./models/YOLOv11/yolo11m-seg.onnx")
DEVICE = os.getenv("ULTRALYTICS_DEVICE", "cpu")

app = FastAPI(title="2.5D Studio v17", version="1.7")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


def to_png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

def _np_to_b64_png(np_img: np.ndarray) -> str:
    """將 numpy 影像（L/RGB/RGBA）輸出成 base64(PNG)"""
    import imageio.v2 as imageio
    buf = io.BytesIO(); imageio.imwrite(buf, np_img, format="png")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# >>> CHG: 小工具 —— 讀回 base64(PNG) 成 RGBA；以及以新背景像素重染外圈半透明區
def _b64_png_to_np_rgba(b64_str: str) -> np.ndarray:
    import imageio.v2 as imageio
    data = base64.b64decode(b64_str)
    arr = imageio.imread(io.BytesIO(data))
    # 強制 RGBA（有些編碼器可能回傳 RGB）
    if arr.ndim == 3 and arr.shape[2] == 3:
        rgba = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
        rgba[..., :3] = arr
        rgba[..., 3] = 255
        return rgba
    return arr

def _recolor_outer_fringes(instances_payload, insts, bg_img_rgb: np.ndarray):
    """
    目標：把「遮罩外（mask==0）但 alpha>0」的像素 RGB 改為新背景顏色，
    消除白邊。就地更新 instances_payload[*]['img_b64']，不改 schema。
    """
    # 準備 id -> mask 映射（uint8 0/255）
    id2mask = {}
    for i, inst in enumerate(insts):
        mu = inst.get("mask")
        if mu is None:
            continue
        mu_u8 = (mu > 0).astype(np.uint8) * 255 if mu.dtype != np.uint8 else mu
        id2mask[int(inst.get("id", i))] = mu_u8

    H, W = bg_img_rgb.shape[:2]

    for idx, item in enumerate(instances_payload):
        try:
            inst_id = int(item.get("id", idx))
            mask = id2mask.get(inst_id, None)
            if mask is None:
                # 退而求其次：以序號對齊
                keys = list(id2mask.keys())
                if idx < len(keys): mask = id2mask[keys[idx]]
            if mask is None:
                continue

            rgba = _b64_png_to_np_rgba(item["img_b64"])
            # 尺寸對齊（理論上與畫布一致；穩健起見 still check）
            h, w = rgba.shape[:2]
            if (h, w) != (H, W):
                # 以背景為基準，resize RGBA 與 mask
                rgba = cv2.resize(rgba, (W, H), interpolation=cv2.INTER_LINEAR)
                mask = cv2.resize(mask, (W, H), interpolation=cv2.INTER_NEAREST)
                h, w = H, W
            elif mask.shape != (h, w):
                mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)

            alpha = rgba[..., 3]
            ext = (mask == 0) & (alpha > 0)

            if np.any(ext):
                rgba[ext, :3] = bg_img_rgb[ext, :3]  # 用新背景像素覆寫
                # 回寫成 base64
                item["img_b64"] = _np_to_b64_png(rgba)
        except Exception as e:
            logger.warning(f"recolor outer fringe failed on instance[{idx}]: {e}")

@app.get("/", response_class=HTMLResponse)
def home():
    with open(os.path.join(STATIC, "index.html"), "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())

@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    fid = unique_id("file")
    dst = os.path.join(UPLOAD_DIR, f"{fid}.png")
    Image.open(io.BytesIO(content)).convert("RGBA").save(dst)
    return {"file_id": fid, "path": dst}

TASKS: Dict[str, SSEQueue] = {}

@app.post("/api/run")
async def run(file_id: str, partial_images: int = 3):
    upath = os.path.join(UPLOAD_DIR, f"{file_id}.png")
    if not os.path.isfile(upath): raise HTTPException(404, "file not found")
    task_id = unique_id("task")
    q = SSEQueue(); TASKS[task_id] = q
    asyncio.create_task(pipeline(task_id, q, upath, partial_images))
    return {"task_id": task_id}

@app.get("/api/stream/{task_id}")
async def stream(task_id: str):
    if task_id not in TASKS: raise HTTPException(404, "task not found")
    q = TASKS[task_id]
    async def event_gen():
        async for item in q.consume():
            yield {"event": item["event"], "data": json.dumps(item["data"])}
    return EventSourceResponse(event_gen())

async def _stream_repaint_bg(q: SSEQueue, bg_input: Image.Image, size_str: str, partial_images: int):
    """
    呼叫 Responses 單圖重畫 API，並把 partial 直接丟到 SSE。
    回傳：最終背景的 base64(PNG)
    """
    loop = asyncio.get_running_loop(); holder = {"b64": None}
    def worker():
        try:
            for ev in stream_repaint_single_image_responses(
                bg_image=bg_input,
                prompt="這是一張已去除前景人物後的背景圖。請根據殘餘像素來進行原場景內容推斷，直接基於此像素『整張重畫』，圖中應該看不出有前景人物存在的痕跡：請保留原有光影/材質/透視一致；輸出尺寸與輸入一致。",
                size=size_str,
                partial_images=partial_images
            ):
                if ev["type"]=="partial":
                    asyncio.run_coroutine_threadsafe(q.push("bg.partial", {"b64": ev["b64"]}), loop)
                elif ev["type"]=="final":
                    holder["b64"] = ev["b64"]
        except Exception as e:
            asyncio.run_coroutine_threadsafe(q.push("progress", {"message": f"❌ 背景串流錯誤：{e}"}), loop)
    await asyncio.to_thread(worker)
    return holder["b64"]

async def pipeline(task_id: str, q: SSEQueue, image_path: str, partial_images: int):
    # 讀檔 & 規格化
    await q.push("progress", {"message": "🔧 讀取與規格化尺寸中..."})
    image_orig = Image.open(image_path).convert("RGBA")
    image, target = resize_to_supported_size(image_orig, prefer='auto')
    size_str = f"{target[0]}x{target[1]}"
    await q.push("progress", {"message": f"✅ 規格化尺寸 {size_str}（對齊 gpt-image-1）"})

    # 轉 numpy
    img_rgb = np.array(image.convert("RGB"))      # HxWx3 uint8
    bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)

    # 深度
    if not os.path.isfile(DEPTH_ONNX):
        await q.push("progress", {"message": "❌ 找不到 DepthAnything ONNX：models/DepthAnything/"}); return
    d = compute_depth_map(bgr, DEPTH_ONNX)        # HxW float
    d = normalize_depth(d)                         # 0..1
    depth_u8 = (np.clip(d,0,1)*255).astype(np.uint8)
    await q.push("depth", {"b64": _np_to_b64_png(depth_u8)})
    await q.push("progress", {"message": "✅ 深度圖完成"})

    # 人物實例分割
    if not os.path.isfile(YOLO_ONNX):
        await q.push("progress", {"message": "❌ 找不到 YOLO11 m-seg ONNX：models/YOLOv11/"}); return
    yolo = load_yolo11_seg(YOLO_ONNX, device=os.getenv("ULTRALYTICS_DEVICE","cpu"))
    insts = person_instances(yolo, bgr)
    h, w = bgr.shape[:2]
    if not insts:
        await q.push("progress", {"message": "⚠️ 沒偵測到人物；直接輸出規格化原圖作為背景"})
        bg_b64 = _np_to_b64_png(np.array(image.convert("RGBA")))
        await q.push("final", {"bg_b64": bg_b64, "instances": [], "depth_b64": _np_to_b64_png(depth_u8)})
        return

    # union 遮罩（0/255）→ 先送清楚的 L 預覽，避免「左下先是全黑」的錯覺
    union = union_mask(insts, (h, w))             # 預期為 uint8(0/255)
    if union.dtype != np.uint8:
        union = (union > 0).astype(np.uint8) * 255
    await q.push("mask", {"b64": _np_to_b64_png(union)})
    await q.push("progress", {"message": "🧩 背景重畫（Responses 單圖，正確 payload）..."})

    # 去人後背景：人物區 alpha=0（以 union 0/255 反相）
    arr_rgba = np.dstack([img_rgb, (255 - union).astype(np.uint8)])  # HxWx4
    bg_input = Image.fromarray(arr_rgba, "RGBA")

    # 背景補洞（串流 partial）
    bg_b64 = await _stream_repaint_bg(q, bg_input, size_str=size_str, partial_images=partial_images)
    if not bg_b64:
        await q.push("progress", {"message": "❌ 背景補洞失敗（Responses 單圖重畫）"}); return
    await q.push("progress", {"message": "✅ 背景重畫完成；組裝多實例 2.5D"})

    # --- 寫「過程檢視」到 data/outputs/<task_id>（可選）---
    # FIX: save_intermediates 只收 4 個參數，且第一個應是 PIL Image（不是 numpy）
    save_intermediates(task_id, image.convert("RGB"), d, union)  # <-- 這行是本次唯一必要修改

    # --- 產生所有前景（只外推透明度；不外推顏色）＋ 寫入 data/outputs/<task_id> ---
    instances_payload = build_instances_payload(
        task_id, img_rgb, d, insts,
        ring_px=0,        # 半透明外圈寬度（px）
        ring_alpha=0.45,  # 外圈透明度（0~1）
        feather_px=3,     # 再小幅羽化
        premultiply=False # 如遇個案亮邊，再改 True
    )

    # --- 背景 b64 → PIL ---
    bg_img = Image.open(io.BytesIO(base64.b64decode(bg_b64))).convert("RGB")

    # --- 組 final（也會把 bg.png / depth.png 落地）---
    final_payload = build_final_payload(task_id, bg_img, d, instances_payload)

    # 送最終結果
    await q.push("final", final_payload)
