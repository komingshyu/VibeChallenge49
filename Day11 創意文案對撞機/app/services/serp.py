# app/services/serp.py
import os, json, re, asyncio
from typing import Any, Dict, List, Optional

MODEL = os.getenv("MODEL", "gpt-4o-mini")
ENV_USE_SERP = os.getenv("USE_SERP", "true").lower() == "true"
SERP_API_KEY = os.getenv("SERPAPI_API_KEY", "").strip()

# SerpAPI（pip: google-search-results）
try:
    from serpapi import GoogleSearch  # pip install google-search-results
except Exception:
    GoogleSearch = None  # 允許無 SERP 狀態運行

from openai import OpenAI
_client = OpenAI()  # 從環境變數讀 OPENAI_API_KEY

def _strip_code_fences(s: str) -> str:
    if not isinstance(s, str):
        return s
    s = s.strip()
    s = re.sub(r"^```(?:json|JSON)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    return s.strip()

def _first_json_block(s: str) -> Optional[str]:
    m = re.search(r"\{.*\}", s, flags=re.S)
    return m.group(0) if m else None

def _coerce_alignment(obj: Any) -> Dict[str, List[str]]:
    if isinstance(obj, str):
        s = _strip_code_fences(obj)
        try:
            obj = json.loads(s)
        except Exception:
            maybe = _first_json_block(s)
            if maybe:
                try:
                    obj = json.loads(maybe)
                except Exception:
                    obj = {}
            else:
                obj = {}
    if not isinstance(obj, dict):
        obj = {}

    def to_list(x) -> List[str]:
        if x is None:
            return []
        if isinstance(x, list):
            return [str(i).strip("• ").strip() for i in x if str(i).strip()]
        if isinstance(x, str):
            parts = re.split(r"[\n\r;；]+", x)
            return [p.strip("• ").strip() for p in parts if p.strip()]
        return []

    return {
        "features": to_list(obj.get("features")),
        "competitors": to_list(obj.get("competitors")),
        "background": to_list(obj.get("background")),
        "keywords": to_list(obj.get("keywords")),
    }

def _serp_fetch(q: str, use_serp_flag: bool) -> Dict[str, Any]:
    if not use_serp_flag or not SERP_API_KEY or GoogleSearch is None:
        return {}
    search = GoogleSearch({
        "q": q, "engine": "google", "api_key": SERP_API_KEY, "hl": "zh-TW", "num": 10,
    })
    return search.get_dict()

def _mk_serp_context(raw: Dict[str, Any]) -> str:
    if not raw:
        return ""
    parts = []
    for item in (raw.get("organic_results") or [])[:8]:
        title = item.get("title") or ""
        snippet = item.get("snippet") or ""
        parts.append(f"- {title}\n  {snippet}")
    kg = raw.get("knowledge_graph") or {}
    if kg:
        parts.append(f"KG: {kg.get('title','')} | type={kg.get('type','')}")
    return "\n".join(parts)

def _summarize_to_alignment(product_term: str, serp_context: str, lang: str = "zh-TW") -> Dict[str, List[str]]:
    sys = (
        "你是資深市場研究員。請根據提供的 SERP 摘要（可能為空），"
        "輸出一個 JSON 物件，鍵必須包含：features, competitors, background, keywords。"
        "每個鍵對應『繁體中文』字串陣列。不要輸出多餘說明或文字。"
    )
    user = (
        f"產品詞：{product_term}\n"
        f"語言：{lang}\n"
        f"SERP 摘要（可能為空）：\n{serp_context or '(無 SERP，請依一般常識與產業知識估算)'}"
    )
    try:
        resp = _client.chat.completions.create(
            model=MODEL,
            response_format={"type": "json_object"},
            temperature=0.3,
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": user}],
        )
        text = resp.choices[0].message.content
        return _coerce_alignment(text)
    except Exception:
        return _coerce_alignment({
            "features": [f"{product_term} 的核心賣點", "設計與易用性", "價格/保固"],
            "competitors": [],
            "background": [f"{product_term} 的典型使用情境與市場趨勢"],
            "keywords": [product_term],
        })

def _align_sync(product_term: str, lang: str, use_serp_flag: bool) -> Dict[str, List[str]]:
    serp_raw = _serp_fetch(product_term, use_serp_flag)
    context = _mk_serp_context(serp_raw)
    data = _summarize_to_alignment(product_term, context, lang=lang)
    return _coerce_alignment(data)

async def align_concepts(product_term: str, lang: str = "zh-TW", use_serp: Optional[bool] = None) -> Dict[str, List[str]]:
    """
    外部 async 呼叫點：回傳乾淨結構化 JSON（四個陣列）
    main.py 以 `await align_concepts(product_term, use_serp=use_serp)` 呼叫。
    """
    use_flag = ENV_USE_SERP if use_serp is None else bool(use_serp)
    return await asyncio.to_thread(_align_sync, product_term, lang, use_flag)
