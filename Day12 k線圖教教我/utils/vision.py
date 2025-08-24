
import os, json, base64, re
from typing import List, Dict, Any, Optional, Tuple

# ============== Helpers ==============

def _clamp01(v: float) -> float:
    try:
        v = float(v)
    except Exception:
        v = 0.0
    return max(0.0, min(1.0, v))

def _coerce_bbox(b) -> Dict[str, float]:
    if isinstance(b, dict):
        if all(k in b for k in ("x","y","w","h")):
            x,y,w,h = b["x"], b["y"], b["w"], b["h"]
        elif all(k in b for k in ("x","y","x2","y2")):
            x,y = b["x"], b["y"]; w,h = b["x2"]-x, b["y2"]-y
        else:
            x = b.get("x", 0); y = b.get("y", 0)
            w = b.get("w", b.get("width", 0.1)); h = b.get("h", b.get("height", 0.1))
    elif isinstance(b, (list, tuple)) and len(b) >= 4:
        x,y,w,h = b[:4]
    else:
        x=y=0; w=h=0.1
    return {"x": _clamp01(x), "y": _clamp01(y), "w": _clamp01(w), "h": _clamp01(h)}

def _sanitize_items(raw) -> List[Dict[str, Any]]:
    if raw is None: return []
    if isinstance(raw, dict):
        items = raw.get("items") or raw.get("predictions") or raw.get("results") or []
    elif isinstance(raw, (list, tuple)):
        items = list(raw)
    else:
        return []
    out = []
    for it in items:
        if not isinstance(it, dict):
            if isinstance(it, (list, tuple)) and len(it) >= 4:
                it = {"title": it[0], "explanation": it[1], "type": it[2], "bbox": it[3]}
            else:
                continue
        out.append({
            "title": str(it.get("title","")),
            "explanation": str(it.get("explanation","")),
            "type": str(it.get("type","其他")),
            "bbox": _coerce_bbox(it.get("bbox")),
            "confidence": float(it.get("confidence", 0.5)) if str(it.get("confidence","")).strip()!="" else 0.5,
            "importance": int(float(it.get("importance", 3))) if str(it.get("importance","")).strip()!="" else 3,
        })
    return out

# ============== Extraction (START-only delimiter) ==============

DELIM_START = "=@ai==="  # concise start token

def mask_json_for_display(text: str) -> str:
    """While streaming, hide everything after the start delimiter."""
    if not text:
        return text
    idx = text.find(DELIM_START)
    if idx != -1:
        return text[:idx]
    return text

def _extract_balanced_from(text: str, start_idx: int) -> Optional[str]:
    """Return balanced JSON block starting from start_idx ('{' or '['), or None."""
    if start_idx < 0 or start_idx >= len(text):
        return None
    open_ch = text[start_idx]
    if open_ch not in "{[":
        return None
    close_ch = "}" if open_ch == "{" else "]"
    depth = 0
    in_str = False
    esc = False
    for i in range(start_idx, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    return text[start_idx:i+1]
    return None

def _extract_first_json_block(text: str) -> Optional[str]:
    starts = [i for i in (text.find("{"), text.find("[")) if i != -1]
    if not starts:
        return None
    start = min(starts)
    return _extract_balanced_from(text, start)

def _extract_last_json_block(text: str) -> Optional[str]:
    starts = [i for i in (text.rfind("{"), text.rfind("[")) if i != -1]
    if not starts:
        return None
    start = max(starts)
    return _extract_balanced_from(text, start)

def _extract_after_start_delim(text: str) -> Tuple[Optional[str], dict]:
    """Take substring after DELIM_START and extract the first balanced JSON block in that tail."""
    dbg = {"method": "start_delim+balanced_first", "found": False, "start": -1}
    s = text.find(DELIM_START)
    if s == -1:
        return None, dbg
    tail = text[s + len(DELIM_START):]
    payload = _extract_first_json_block(tail)
    if payload is not None:
        dbg.update({"found": True, "start": s})
        return payload, dbg
    payload = _extract_last_json_block(tail)
    if payload is not None:
        dbg.update({"found": True, "start": s, "fallback": "balanced_last_in_tail"})
        return payload, dbg
    return None, dbg

def parse_items_debug(full_text: str) -> Tuple[List[Dict[str, Any]], dict]:
    """Return (items, debug_info) with multi-strategy extraction and parse status."""
    dbg = {"stage": "", "error": "", "raw_payload": ""}

    payload, info = _extract_after_start_delim(full_text)
    dbg.update(info)

    if payload is None:
        payload = _extract_last_json_block(full_text)
        if payload is not None:
            dbg.update({"method": "balanced_last_global", "found": True})

    if payload is None:
        payload = _extract_first_json_block(full_text)
        if payload is not None:
            dbg.update({"method": "balanced_first_global", "found": True})

    if payload is None:
        dbg["error"] = "no_payload_found"
        return [], dbg

    dbg["raw_payload"] = payload[:5000]
    try:
        data = json.loads(payload)
    except Exception as e:
        payload2 = re.sub(r",\s*([}\]])", r"\1", payload)
        try:
            data = json.loads(payload2)
            dbg["stage"] = "parsed_after_trailing_comma_fix"
        except Exception as e2:
            dbg["error"] = f"json_parse_error: {e2}"
            return [], dbg

    items = _sanitize_items(data)
    dbg["stage"] = dbg.get("stage","parsed")
    dbg["parsed_items"] = len(items)
    return items, dbg

# ============== OpenAI streaming ==============

def openai_stream_vision(png_bytes: bytes, model: str = "gpt-4o"):
    api_key = os.getenv("OPENAI_API_KEY","").strip()
    if not api_key:
        yield "（未設定 OPENAI_API_KEY）"; return
    try:
        from openai import OpenAI
    except Exception:
        yield "（openai 套件未安裝）"; return

    client = OpenAI(api_key=api_key)
    img_b64 = base64.b64encode(png_bytes).decode("utf-8")
    data_uri = f"data:image/png;base64,{img_b64}"

    system = """
你是一位以繁體中文教學有著多年股市實戰經驗的 K 線圖講師。
稍後使用者每次會提供一張k線圖截圖給你，再仔細閱讀此k線圖內容後，請依序輸出**技術分析主文**=>特殊分隔線=>視覺特徵標籤

技術分析主文:請根據k線圖上的價格、趨勢線以及成交量的變動，進行詳盡的技術分析，也同時給予具體的價格建議。請注意台灣股市上漲是紅色下跌是綠色與國際市場相反。所有涉及波型的說明都必須清楚附上發生年月，文長約500字上下

特殊分隔線:主文結束後，請輸出一行 '=@ai===', 然後直接輸出 視覺特徵標籤JSON（不要 markdown 包裝，也不要再輸出其他文字）。
視覺特徵標籤:針對主文中出現的波型術語(例如股價穿破年均線、1000元左右有支撐、黃金交叉...)產生如以下格式的標籤
視覺特徵標籤JSON 結構:
{
  "items":[
    {
      "title": "波型特徵術語",
      "explanation": "此術語的教學解釋（繁體中文）",
      "type": "支撐|阻力|均線|趨勢|缺口|K棒形態|量價背離|其他",
      "bbox": {x,y,w,h}一律為 0~1 相對座標。例如:{"x":0.12,"y":0.34,"w":0.2,"h":0.1},
      "confidence": 0.0_to_1.0,
      "importance": 1_to_5,
      "related_terms": 請以列舉主文中命中此波型特徵術語字串列表
}



 """
    user = "請對這張 K 線圖進行技術分析"

    stream = client.chat.completions.create(
        model=model,
        messages=[
            {"role":"system","content":system},
            {"role":"user","content":[
                {"type":"text","text":user},
                {"type":"image_url","image_url":{"url":data_uri}}
            ]}
        ],
        temperature=0.2,
        stream=True,
        max_tokens=1000
    )
    for chunk in stream:
        piece = ""
        try:
            piece = chunk.choices[0].delta.content or ""
        except Exception:
            pass
        if piece:
            yield piece
