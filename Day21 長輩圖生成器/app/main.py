
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import json, os
from pathlib import Path

from .services.utils import logger
from .services.nano_banana import NanoBananaImageGen
from .services.openai_service import transcribe_audio_wav
from .services.overlay import render_overlay
from .services.fonts import list_fonts, download_default_fonts
from .services.templates_store import list_templates, create_template, update_template, delete_template
from .services.gallery import list_gallery, delete_image
from .services.share import make_share_payload

app = FastAPI(title="長輩圖超級生成器", version="1.0.6")

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
ASSETS_DIR = BASE_DIR / "assets"
if not STATIC_DIR.exists(): raise RuntimeError(f"靜態目錄不存在：{STATIC_DIR}")
if not ASSETS_DIR.exists(): raise RuntimeError(f"資產目錄不存在：{ASSETS_DIR}")

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

@app.get("/", response_class=HTMLResponse)
def index():
    return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))

def _resolve_gallery_path(p: str) -> str:
    try:
        if not p: return p
        p_norm = p.replace('\\', '/')
        if p_norm.startswith('/assets/gallery/') or p_norm.startswith('assets/gallery/'):
            name = p_norm.split('/')[-1]
            real = ASSETS_DIR / 'gallery' / name
            return str(real)
        return p
    except Exception:
        return p

@app.get("/api/generate/text/stream")
def generate_from_text_stream(prompt: str = Query(..., description="提示詞")):
    try:
        nb = NanoBananaImageGen()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    def event_gen():
        try:
            for evt in nb.stream_generate_from_text(prompt):
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception(e)
            yield f"data: {json.dumps({'event':'error','message':str(e)})}\n\n"
    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/generate/image2image/stream")
async def generate_from_images_stream(
    prompt: str = Form(...),
    grandparent: UploadFile = File(None),
    grandchild: UploadFile = File(None),
):
    try:
        nb = NanoBananaImageGen()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    images: List[bytes] = []; mimes: List[str] = []
    for f in [grandparent, grandchild]:
        if f is not None:
            images.append(await f.read())
            mimes.append(f.content_type or "image/jpeg")

    def event_gen():
        # 讓瀏覽器立刻進入串流模式（避免緩衝）
        yield "event: ping\ndata: 0\n\n"
        try:
            for evt in nb.stream_generate_from_images(prompt, images, mimes):
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception(e)
            yield f"data: {json.dumps({'event':'error','message':str(e)})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",   # 若以後前面有 Nginx，這行很重要
        },
    )

@app.post("/api/voice/transcribe")
async def voice_transcribe_api(file: UploadFile = File(...)):
    try:
        wav_bytes = await file.read()
        text = transcribe_audio_wav(wav_bytes)
        return {"text": text}  # 即使空字串也回 200，前端會 fallback
    except Exception as e:
        logger.exception(e)
        return {"text": ""}

@app.post("/api/prompt/optimize")
async def prompt_optimize(payload: Dict[str, Any]):
    src = payload.get("prompt", "").strip()
    if not src:
        return {"optimized": "家裡的橘貓趴在餐桌邊，盯著滿桌熱騰騰的中式早餐，肥肚子快撐不住；家人邊笑邊用餐，清晨的日光灑進屋內。"}
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        sys_prompt = (
            "請基於台灣長輩圖的概念與風格，把使用者的輸入句子以繁體中文進行擴寫，可加入光線、表情、動作與環境細節；圖中不要出現文字。"
        )
        resp =  client.responses.create(model="gpt-4o", instructions=sys_prompt, input=src)
      
        return {"optimized": resp.output_text.strip()}
    except Exception as e:
        return {"optimized": f"{src}，{e}"}

@app.post("/api/prompt/ideate")
async def prompt_ideate(payload: Dict[str, Any]):
    theme = payload.get("theme", "祖孫出遊")
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        sys_prompt =  "你是個才華洋溢的長輩圖設計師，請根據使用者輸入主題設計出一張符合台灣式長輩圖風格圖像的prompt，圖中不要出現文字"
        
        user = f"主題:{theme}"
        resp = client.responses.create(model="gpt-4o", instructions=sys_prompt, input=user)
        return  {"ideas":[resp.output_text.strip()]}
    except Exception as e:
        return {"ideas": [f"{e}"]}

    

@app.post("/api/overlay/render")
async def api_overlay_render(payload: Dict[str, Any]):
    base = _resolve_gallery_path(payload.get("base_image_path", ""))
    texts = payload.get("texts", [])
    if not base:
        raise HTTPException(status_code=400, detail="缺少 base_image_path")
    try:
        out = render_overlay(base, texts)
        return {"output": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/fonts/list")
def api_fonts_list(): return {"fonts": list_fonts()}
@app.post("/api/fonts/install")
def api_fonts_install(): return {"result": download_default_fonts()}

@app.get("/api/templates")
def api_templates_list(): return {"templates": list_templates()}
@app.post("/api/templates")
def api_templates_create(payload: Dict[str, Any]): return {"created": create_template(payload)}
@app.put("/api/templates/{tid}")
def api_templates_update(tid: str, payload: Dict[str, Any]):
    try: return {"updated": update_template(tid, payload)}
    except KeyError: raise HTTPException(status_code=404, detail="模板不存在")
@app.delete("/api/templates/{tid}")
def api_templates_delete(tid: str):
    ok = delete_template(tid)
    if not ok: raise HTTPException(status_code=404, detail="模板不存在")
    return {"deleted": True}

@app.get("/api/gallery")
def api_gallery_list(): return {"items": list_gallery()}
@app.delete("/api/gallery/{name}")
def api_gallery_delete(name: str):
    ok = delete_image(name)
    if not ok: raise HTTPException(status_code=404, detail="檔案不存在")
    return {"deleted": True}

@app.post("/api/share/payload")
def api_share_payload(payload: Dict[str, Any]):
    path = payload.get("image_path", "")
    if not path: raise HTTPException(status_code=400, detail="缺少 image_path")
    return make_share_payload(path)
