import os

LANG_TO_TAG = {
    "繁體中文": "#zh-TW",
    "簡體中文": "#zh-CN",
    "English": "#en-US",
    "日本語": "#ja-JP",
    "한국어": "#ko-KR",
}

def _openai_client():
    try:
        from openai import OpenAI
        k=os.getenv("OPENAI_API_KEY")
        if not k:
            return None
        base=os.getenv("OPENAI_BASE_URL")
        return OpenAI(api_key=k, base_url=base) if base else OpenAI(api_key=k)
    except Exception:
        return None

def translate_text(text: str, target_lang: str) -> str:
    # Best-effort translation; if no API key, return original.
    if not text.strip():
        return text
    cli=_openai_client()
    if cli is None:
        return text  # fallback: no translation available
    try:
        prompt = f"請將以下文字準確翻譯成 {target_lang}。只輸出翻譯結果，不要加任何解釋。\n[輸入]\n{text}"
        r = cli.responses.create(model=os.getenv("OPENAI_LLM_MODEL","gpt-4o-mini"), temperature=0.2, input=[{"role":"user","content":prompt}])
        out = (r.output_text or "").strip()
        return out or text
    except Exception:
        return text
