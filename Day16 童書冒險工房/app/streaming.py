# app/streaming.py
from __future__ import annotations
import os, json, time, asyncio, uuid
from pathlib import Path
from typing import AsyncGenerator, Dict, Any, Iterable, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from .sse_utils import sse_pack, SSE_HEADERS, heartbeat

# 依你的實際結構調整
OUTPUT_ROOT = (Path(__file__).parent / "output").resolve()
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/api/stream", tags=["streaming"])

# ---------- 工具：安全 pid 與路徑 ----------
def _require_uuid(pid: str) -> str:
    try:
        return str(uuid.UUID(pid))
    except Exception:
        raise HTTPException(status_code=400, detail="invalid project id")

def _out_path(pid: str, *parts: str) -> Path:
    pid = _require_uuid(pid)
    p = (OUTPUT_ROOT / pid / Path(*parts)).resolve()
    if not str(p).startswith(str(OUTPUT_ROOT)):
        raise HTTPException(status_code=400, detail="invalid path")
    p.parent.mkdir(parents=True, exist_ok=True)
    return p

# ---------- A) 影像串流：邊生邊發（或監看） ----------
async def _watch_images(pid: str, pages: int, pattern: str = "p{idx:02d}.png") -> AsyncGenerator[str, None]:
    """
    監看 output/<pid>/images/ 目錄，檔案一穩定（大小連兩次相同且 > 0）就發 image_ready。
    即使你的生成器沒主動發事件，這支也能把 UI 推起來。
    """
    images_dir = _out_path(pid, "images")
    target = {i: images_dir / pattern.format(idx=i) for i in range(1, pages + 1)}
    seen: set[int] = set()
    last_size: Dict[int, int] = {}
    seq = 0
    start = time.monotonic()

    while len(seen) < pages:
        for i, fp in target.items():
            if i in seen:
                continue
            if fp.exists():
                sz = fp.stat().st_size
                prev = last_size.get(i)
                if prev is not None and prev == sz and sz > 0:
                    # 視為穩定完成，送事件
                    ver = int(fp.stat().st_mtime_ns)  # 當版本參數
                    url = f"/output/{pid}/images/{fp.name}?v={ver}"
                    yield sse_pack("image_ready", {"page": i, "src": url, "size": sz}, id=str(seq))
                    seq += 1
                    seen.add(i)
                else:
                    last_size[i] = sz

        # 心跳（避免代理超時）
        if seq % 20 == 0:
            yield heartbeat(seq)

        await asyncio.sleep(0.5)

    yield sse_pack("done", {"kind": "images", "pages": sorted(seen)}, id=str(seq))

@router.get("/images/{pid}")
async def stream_images(
    pid: str,
    pages: int = Query(14, ge=1, le=200),
) -> StreamingResponse:
    gen = _watch_images(pid, pages)
    return StreamingResponse(gen, headers=SSE_HEADERS)

# ---------- B) 大綱串流（逐字） ----------
def _openai_stream_chunks(prompt: str, model: str = "gpt-4o-mini") -> Iterable[str]:
    """
    簡化版：依序 yield token。若環境沒有 OpenAI，就退回 mock。
    你可換成你現有 openai_client 的串流介面。
    """
    try:
        from openai import OpenAI
        client = OpenAI()
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": "你是專業兒童繪本編劇。"}, {"role": "user", "content": prompt}],
            stream=True,
            temperature=0.7,
        )
        for chunk in resp:
            delta = chunk.choices[0].delta or {}
            if "content" in delta and delta["content"]:
                yield delta["content"]
    except Exception:
        # MOCK：避免阻塞流程（真環境請刪除）
        for ch in ("這", "是", "逐", "字", "流", "輸", "出"):
            time.sleep(0.05)
            yield ch

async def _token_sse(event_name: str, chunks: Iterable[str]) -> AsyncGenerator[str, None]:
    buf = []
    seq = 0
    last_heartbeat = time.monotonic()
    for tok in chunks:
        buf.append(tok)
        yield sse_pack(event_name, {"text": tok}, id=str(seq))
        seq += 1
        # 每 10 秒送心跳
        now = time.monotonic()
        if now - last_heartbeat > 10:
            yield heartbeat(seq)
            last_heartbeat = now
    yield sse_pack("done", {"kind": event_name}, id=str(seq))

@router.get("/outline/{pid}")
async def stream_outline(
    pid: str,
    prompt: str = Query("", description="生成大綱的提示詞；可為空表示用預設模板"),
) -> StreamingResponse:
    _require_uuid(pid)
    chunks = _openai_stream_chunks(prompt or "請生成 14 頁幼兒繪本大綱，每頁 1-2 句。")
    gen = _token_sse("outline_token", chunks)
    return StreamingResponse(gen, headers=SSE_HEADERS)

# ---------- C) 分鏡/劇本串流（逐字 + 週期快照） ----------
async def _storyboard_stream(prompt: str) -> AsyncGenerator[str, None]:
    seq = 0
    acc = []
    last_snapshot = time.monotonic()
    for tok in _openai_stream_chunks(prompt):
        acc.append(tok)
        # 逐字
        yield sse_pack("storyboard_token", {"text": tok}, id=str(seq))
        seq += 1
        # 每 1.5 秒出一次快照（避免丟包造成內容缺失）
        if time.monotonic() - last_snapshot > 1.5:
            yield sse_pack("storyboard_snapshot", {"text": "".join(acc)}, id=str(seq))
            seq += 1
            last_snapshot = time.monotonic()
    # 結尾送最終快照與完成
    yield sse_pack("storyboard_snapshot", {"text": "".join(acc)}, id=str(seq)); seq += 1
    yield sse_pack("done", {"kind": "storyboard"}, id=str(seq))

@router.get("/storyboard/{pid}")
async def stream_storyboard(
    pid: str,
    prompt: str = Query("", description="生成或更新分鏡/劇本用的提示；可包含上一版內容與修改說明"),
) -> StreamingResponse:
    _require_uuid(pid)
    gen = _storyboard_stream(prompt or "依照既有大綱生成 14 頁分鏡，每頁 1-2 句敘事與畫面提示。")
    return StreamingResponse(gen, headers=SSE_HEADERS)
