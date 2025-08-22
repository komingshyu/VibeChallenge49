# app/main.py
import os
import json
from typing import List, Dict, Any, AsyncGenerator

from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from dotenv import load_dotenv

# 服務層
from .services.serp import align_concepts
from .services.terms import sample_terms
from .services.llm import stream_short_copies, stream_deep_copies

# -----------------------------------------------------------------------------
# 基本設定
# -----------------------------------------------------------------------------
load_dotenv()

PORT = int(os.getenv("PORT", "8000"))
APP_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(APP_DIR)

app = FastAPI(title="Creative Copy Collider", version="1.0.1")

# 靜態與模板
app.mount("/static", StaticFiles(directory=os.path.join(APP_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(APP_DIR, "templates"))

# -----------------------------------------------------------------------------
# SSE 小工具：一律輸出合法 JSON（雙引號）
# -----------------------------------------------------------------------------
def sse(event: str, payload: Dict[str, Any]) -> str:
    """產出一則 SSE 事件字串。"""
    return (
        f"event: {event}\n"
        f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    )

def sse_headers() -> Dict[str, str]:
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

# -----------------------------------------------------------------------------
# 首頁
# -----------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# -----------------------------------------------------------------------------
# 概念對齊（SERP→LLM 結構化）
# -----------------------------------------------------------------------------
@app.post("/api/align")
async def api_align(payload: Dict[str, Any]):
    product_term: str = (payload.get("product_term") or "").strip()
    lang: str = (payload.get("lang") or "zh-TW").strip()
    if not product_term:
        return JSONResponse({"error": "缺少 product_term"}, status_code=400)

    # .env 的 USE_SERP 可被前端覆蓋
    env_use_serp = os.getenv("USE_SERP", "true").lower() == "true"
    use_serp = bool(payload.get("use_serp", env_use_serp))

    try:
        data = await align_concepts(product_term, lang=lang, use_serp=use_serp)
        # 確保輸出是四個陣列
        return JSONResponse({"alignment": data}, status_code=200)
    except Exception as e:
        return JSONResponse({"error": f"align 失敗：{e}"}, status_code=500)

# -----------------------------------------------------------------------------
# 待碰撞詞彙抽樣
# -----------------------------------------------------------------------------
@app.get("/api/terms")
async def api_terms(k: int = Query(20, gt=0, le=64)):
    terms = sample_terms(k)
    return JSONResponse({"terms": terms}, status_code=200)

# -----------------------------------------------------------------------------
# 碰撞初試（SSE，逐 token 串流）
# -----------------------------------------------------------------------------
@app.post("/api/initial-collision")
async def api_initial_collision(payload: Dict[str, Any]):
    product_term: str = (payload.get("product_term") or "").strip()
    terms: List[str] = payload.get("terms") or []
    lang: str = (payload.get("lang") or "zh-TW").strip()

    if not product_term:
        return JSONResponse({"error": "缺少 product_term"}, status_code=400)
    if not terms:
        return JSONResponse({"error": "terms 不能為空"}, status_code=400)

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            # llm.stream_short_copies 會產出事件 dict（header/delta/end）
            async for ev in stream_short_copies(product_term, terms, lang=lang):
                yield sse("delta", ev)
        except Exception as e:
            # 以事件形式回傳錯誤，不中斷連線
            yield sse("delta", {"mode": "error", "message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=sse_headers())

# -----------------------------------------------------------------------------
# 深度碰撞（SSE，逐 token 串流）
# -----------------------------------------------------------------------------
@app.post("/api/deep-collision")
async def api_deep_collision(payload: Dict[str, Any]):
    product_term: str = (payload.get("product_term") or "").strip()
    candidates: List[str] = payload.get("candidates") or []
    persona: Dict[str, Any] = payload.get("persona") or {}
    media: str = (payload.get("media") or "").strip()
    lang: str = (payload.get("lang") or "zh-TW").strip()

    if not product_term:
        return JSONResponse({"error": "缺少 product_term"}, status_code=400)
    if not candidates:
        return JSONResponse({"error": "candidates 不能為空"}, status_code=400)

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            async for ev in stream_deep_copies(product_term, candidates, persona=persona, media=media, lang=lang):
                yield sse("delta", ev)
        except Exception as e:
            yield sse("delta", {"mode": "error", "message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=sse_headers())
