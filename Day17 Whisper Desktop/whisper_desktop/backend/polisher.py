import os
SYSTEM_ZH = "你是逐字稿潤飾器：去贅字與口頭禪、修正近音錯字、加入自然標點；不翻譯、不杜撰、不改變專有名詞。輸出僅限一句話內容，不要附加任何說明或括號。"
def _client():
    try:
        from openai import OpenAI
        k=os.getenv("OPENAI_API_KEY")
        if not k: return None
        base=os.getenv("OPENAI_BASE_URL")
        return OpenAI(api_key=k, base_url=base) if base else OpenAI(api_key=k)
    except Exception: return None
def _ensure_traditional(text: str) -> str:
    try:
        from opencc import OpenCC
        return OpenCC('s2t').convert(text)
    except Exception:
        return text

def _lang_name(tag: str) -> str:
    if "zh-TW" in tag or "繁" in tag: return "繁體中文"
    if "zh-CN" in tag or "简" in tag or "簡" in tag: return "簡體中文"
    if "en" in tag or "English" in tag: return "English"
    return "繁體中文"

def polish_sentence(current: str, context, language_tag="#zh-TW")->str:
    cur = (current or "").strip()
    if not cur: return cur
    cli=_client()
    if cli is None:
        return _ensure_traditional(cur) if ("zh-TW" in language_tag or "繁" in language_tag) else cur
    model=os.getenv("OPENAI_LLM_MODEL","gpt-4.1")
    lang_name=_lang_name(language_tag)
    ctx=context[-10:] if context else []
    prompt=(
        f"請使用{lang_name}，基於下列上文的語境來潤飾此句子{{下文}}:\n"
        f"\"\"\"\n" + ("\n".join(ctx) if ctx else "(無上文)") + "\n\"\"\"\n"
        f"只潤飾{{下文}}，不要把上文複製到輸出。輸出請為單行自然語句。\n"
        f"{{下文}}: {cur}"
    )
    try:
        r=cli.responses.create(model=model, temperature=0.2, input=[{"role":"system","content":SYSTEM_ZH},{"role":"user","content":prompt}])
        out=(r.output_text or cur).strip()
        if "zh-TW" in language_tag or "繁" in language_tag:
            out=_ensure_traditional(out)
        return out
    except Exception:
        return _ensure_traditional(cur) if ("zh-TW" in language_tag or "繁" in language_tag) else cur
