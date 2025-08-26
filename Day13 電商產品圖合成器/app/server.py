from __future__ import annotations
import os
import io
import base64
import uuid
import json
import asyncio
import logging
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .services.openai_image import OpenAIImageService, ImageGenError
from .services.upscale import Upscaler, UpscaleNotAvailable
from .utils.rate_limiter import AsyncRateLimiter
from .utils.io_helpers import ensure_dir, read_file_to_base64, save_bytes

APP_DIR = os.path.dirname(__file__)
WEB_DIR = os.path.join(APP_DIR, "web")
DATA_DIR = os.path.join(APP_DIR, "data")
INPUTS_DIR = os.path.join(DATA_DIR, "inputs")
OUTPUTS_DIR = os.path.join(DATA_DIR, "outputs")
WEIGHTS_DIR = os.path.join(APP_DIR, "weights")

app = FastAPI(title="Ecom Image Composer (GPT-4o + Responses API)", version="1.1.3")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

openai_service = OpenAIImageService(model="gpt-4.1")
upscaler = Upscaler(weights_path=os.path.join(WEIGHTS_DIR, "real_esrgan_x4.onnx"))
rate_limiter = AsyncRateLimiter(
    max_concurrency=int(os.getenv("MAX_CONCURRENCY", "2")),
    min_interval_ms=int(os.getenv("MIN_INTERVAL_MS", "300")),
)

for d in (WEB_DIR, DATA_DIR, INPUTS_DIR, OUTPUTS_DIR, WEIGHTS_DIR):
    ensure_dir(d)

@app.get("/", response_class=HTMLResponse)
async def home():
    index_path = os.path.join(WEB_DIR, "index.html")
    if not os.path.exists(index_path):
        return HTMLResponse("<h1>UI 未找到</h1>", status_code=500)
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())

def _build_prompt_system_prefix() -> str:
    return (
        "You are a senior commercial product photographer and compositor. "
        "Always keep the original product recognizable and realistic. "
        "Respect brand integrity, maintain natural lighting and human proportions. "
        "Avoid watermarks and copyrighted characters unless explicitly licensed. "
        "Output only the final image via the image generation tool."
    )

def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

async def _stream_with_heartbeat(queue: asyncio.Queue, handler):
    """Read events from queue and yield SSE frames; send heartbeat every 5s to defeat buffering."""
    while True:
        try:
            evt = await asyncio.wait_for(queue.get(), timeout=5.0)
        except asyncio.TimeoutError:
            yield _sse("status", {"stage": "working"})
            continue
        t = evt.get("type")
        out = await handler(t, evt)
        if out is not None:
            yield out
        if t == "end":
            break


@app.post("/api/upscale")
async def upscale_only(
    image: UploadFile = File(..., description="要放大的圖"),
):
    try:
        buf = await image.read()
        up_bytes = upscaler.upscale_image_bytes(buf)
        out_name = f"up_{uuid.uuid4().hex}_x4.png"
        out_path = os.path.join(OUTPUTS_DIR, out_name)
        save_bytes(out_path, up_bytes)
        return JSONResponse({"ok": True, "result": {"upscaled_url": f"/outputs/{out_name}"}})
    except UpscaleNotAvailable as e:
        raise HTTPException(500, f"Upscale 無法使用：{e}") from e
    except Exception as e:
        logging.exception("upscale failed")
        raise HTTPException(500, f"Upscale 失敗：{e}") from e

# -------- Streaming SSE endpoints (sequence-based partials) --------
@app.post("/api/generate/scene/stream")
async def generate_scene_stream(
    product: UploadFile = File(...),
    prompt: str = Form(...),
    upscale_after: bool = Form(False),
    session_id: Optional[str] = Form(None),
    partial_images: int = Form(2),
):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(500, "OPENAI_API_KEY 未設定於環境變數")

    uid = uuid.uuid4().hex
    product_b64 = await read_file_to_base64(product)
    final_prompt = (
        _build_prompt_system_prefix() +
        "\n\nEdit the given product photo to match the requested scene. Keep brand/logo intact.\n\n" +
        f"User request: {prompt}"
    )

    async def gen():
        async with rate_limiter.throttle():
            try:
                q = await openai_service.stream_image_from_inputs(
                    [product_b64], final_prompt, session_id=session_id, partial_images=partial_images
                )
                yield _sse("status", {"stage": "start"})
                seq = 0  # running sequence for *steps* (not image index)
                async def handle(t, evt):
                    nonlocal seq
                    if t == "partial":
                        # each partial event becomes next sequence number (p01, p02, ...)
                        seq += 1
                        try:
                            img_bytes = base64.b64decode(evt["b64"])
                            name = f"scene_{uid}_p{seq:02d}.png"
                            save_bytes(os.path.join(OUTPUTS_DIR, name), img_bytes)
                            return _sse("partial", {"seq": seq, "url": f"/outputs/{name}"})
                        except Exception as e:
                            return _sse("warn", {"message": f"儲存 partial 失敗：{e}"})
                    elif t == "final":
                        img_bytes = base64.b64decode(evt["b64"])
                        final_name = f"scene_{uid}.png"
                        save_bytes(os.path.join(OUTPUTS_DIR, final_name), img_bytes)
                        up_url = None
                        if upscale_after:
                            try:
                                up_bytes = await asyncio.to_thread(upscaler.upscale_image_bytes, img_bytes)
                                up_name = f"scene_{uid}_x4.png"
                                save_bytes(os.path.join(OUTPUTS_DIR, up_name), up_bytes)
                                up_url = f"/outputs/{up_name}"
                            except UpscaleNotAvailable as e:
                                return _sse("warn", {"message": str(e)})
                            except Exception as e:
                                return _sse("warn", {"message": f"放大失敗：{e}"})
                        return _sse("final", {"image_url": f"/outputs/{final_name}", "upscaled_url": up_url})
                    elif t == "error":
                        return _sse("error", {"message": evt.get("message", "unknown")})
                    elif t == "end":
                        return _sse("done", {})
                    return None
                async for chunk in _stream_with_heartbeat(q, handle):
                    yield chunk
            except Exception as e:
                logging.exception("scene stream error")
                yield _sse("error", {"message": str(e)})
                yield _sse("done", {})

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)

@app.post("/api/generate/person/stream")
async def generate_person_stream(
    product: UploadFile = File(...),
    person: UploadFile = File(...),
    prompt: str = Form(...),
    upscale_after: bool = Form(False),
    session_id: Optional[str] = Form(None),
    confirm_consent: bool = Form(False),
    partial_images: int = Form(2),
):
    if not confirm_consent:
        raise HTTPException(400, "請勾選『我已取得人物肖像使用授權』後再執行。")
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(500, "OPENAI_API_KEY 未設定於環境變數")

    uid = uuid.uuid4().hex
    pb64 = await read_file_to_base64(product)
    hb64 = await read_file_to_base64(person)
    final_prompt = (
        _build_prompt_system_prefix() +
        "\n\nComposite the given person into the product scene naturally. Match lighting, perspective, and scale.\n\n" +
        f"User request: {prompt}"
    )

    async def gen():
        async with rate_limiter.throttle():
            try:
                q = await openai_service.stream_image_from_inputs(
                    [pb64, hb64], final_prompt, session_id=session_id, partial_images=partial_images
                )
                yield _sse("status", {"stage": "start"})
                seq = 0
                async def handle(t, evt):
                    nonlocal seq
                    if t == "partial":
                        seq += 1
                        try:
                            img_bytes = base64.b64decode(evt["b64"])
                            name = f"person_{uid}_p{seq:02d}.png"
                            save_bytes(os.path.join(OUTPUTS_DIR, name), img_bytes)
                            return _sse("partial", {"seq": seq, "url": f"/outputs/{name}"})
                        except Exception as e:
                            return _sse("warn", {"message": f"儲存 partial 失敗：{e}"})
                    elif t == "final":
                        img_bytes = base64.b64decode(evt["b64"])
                        final_name = f"person_{uid}.png"
                        save_bytes(os.path.join(OUTPUTS_DIR, final_name), img_bytes)
                        up_url = None
                        if upscale_after:
                            try:
                                up_bytes = await asyncio.to_thread(upscaler.upscale_image_bytes, img_bytes)
                                up_name = f"person_{uid}_x4.png"
                                save_bytes(os.path.join(OUTPUTS_DIR, up_name), up_bytes)
                                up_url = f"/outputs/{up_name}"
                            except UpscaleNotAvailable as e:
                                return _sse("warn", {"message": str(e)})
                            except Exception as e:
                                return _sse("warn", {"message": f"放大失敗：{e}"})
                        return _sse("final", {"image_url": f"/outputs/{final_name}", "upscaled_url": up_url})
                    elif t == "error":
                        return _sse("error", {"message": evt.get("message", "unknown")})
                    elif t == "end":
                        return _sse("done", {})
                    return None
                async for chunk in _stream_with_heartbeat(q, handle):
                    yield chunk
            except Exception as e:
                logging.exception("person stream error")
                yield _sse("error", {"message": str(e)})
                yield _sse("done", {})

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)

@app.post("/api/batch")
async def batch_process(
    mode: str = Form(..., description="'scene' 或 'person'"),
    prompt: str = Form(...),
    files: List[UploadFile] = File(..., description="資料夾內所有產品圖"),
    person: Optional[UploadFile] = File(None, description="（選）人物照片，若為 'person' 模式則會套用到全部"),
    upscale_after: bool = Form(False),
    max_concurrency: int = Form(2),
    min_interval_ms: int = Form(300),
    confirm_consent: bool = Form(False, description="若使用人物照，請勾選授權"),
):
    if mode not in ("scene", "person"):
        raise HTTPException(400, "mode 僅支援 'scene' 或 'person'")
    if mode == "person" and not confirm_consent:
        raise HTTPException(400, "請勾選『我已取得人物肖像使用授權』後再執行。")

    rate_limiter.set_limits(max_concurrency=max_concurrency, min_interval_ms=min_interval_ms)

    person_b64 = None
    if person:
        person_b64 = await read_file_to_base64(person)

    results: List[Dict[str, Any]] = []

    async def _worker(file: UploadFile):
        nonlocal results
        product_b64 = await read_file_to_base64(file)
        if mode == "scene":
            txt = (
                _build_prompt_system_prefix()
                + "\n\nEdit the given product photo to match the requested scene. "
                  "Keep brand/logo intact.\n\n"
                + f"User request: {prompt}"
            )
            imgs = [product_b64]
        else:
            txt = (
                _build_prompt_system_prefix()
                + "\n\nComposite the given person into the product scene. "
                  "Match lighting, perspective, and scale.\n\n"
                + f"User request: {prompt}"
            )
            imgs = [product_b64] + ([person_b64] if person_b64 else [])

        async with rate_limiter.throttle():
            try:
                img_bytes = await openai_service.generate_image_from_inputs(imgs, txt)
            except ImageGenError as e:
                results.append({"file": file.filename, "ok": False, "error": str(e)})
                return

        base = os.path.splitext(os.path.basename(file.filename))[0]
        out_name = f"{base}_{mode}_{uuid.uuid4().hex[:8]}.png"
        out_path = os.path.join(OUTPUTS_DIR, out_name)
        save_bytes(out_path, img_bytes)

        up_url = None
        if upscale_after:
            try:
                up_bytes = upscaler.upscale_image_bytes(img_bytes)
                up_name = out_name.replace(".png", "_x4.png")
                save_bytes(os.path.join(OUTPUTS_DIR, up_name), up_bytes)
                up_url = f"/outputs/{up_name}"
            except UpscaleNotAvailable as e:
                up_url = None
            except Exception:
                up_url = None

        results.append({
            "file": file.filename,
            "ok": True,
            "image_url": f"/outputs/{out_name}",
            "upscaled_url": up_url
        })

    tasks = [asyncio.create_task(_worker(f)) for f in files]
    await asyncio.gather(*tasks)

    return JSONResponse({"ok": True, "results": results})


@app.get("/api/healthz")
def healthz():
    return {"ok": True, "model": openai_service.model, "upscale": upscaler.available}

