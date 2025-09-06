# app/sse_utils.py
from __future__ import annotations
import json
import time
from typing import Any, Dict

SSE_HEADERS = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  # 關閉反向代理緩衝（Nginx）
}

def sse_pack(event: str, data: Dict[str, Any], id: str | None = None) -> str:
    """
    封裝成 SSE 格式：可選 id、必帶 event 與 data(JSON)。
    """
    buf = []
    if id is not None:
        buf.append(f"id: {id}")
    if event:
        buf.append(f"event: {event}")
    # 注意：每行必須以 \n 結束，最後要空一行
    buf.append("data: " + json.dumps(data, ensure_ascii=False))
    return "\n".join(buf) + "\n\n"

def heartbeat(seq: int) -> str:
    # 一致的心跳事件（避免代理閒置超時）
    return sse_pack("ping", {"t": time.time(), "seq": seq})
