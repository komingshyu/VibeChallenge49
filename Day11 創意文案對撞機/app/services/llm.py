# app/services/llm.py
import os
import json
import asyncio
import threading
import hashlib
from typing import Any, Dict, AsyncGenerator, List

from openai import OpenAI

# ---- 可調參數（.env） -------------------------------------------------------
MODEL = os.getenv("MODEL", "gpt-4o-mini")
OPENAI_TIMEOUT = float(os.getenv("OPENAI_TIMEOUT", "60"))

# 初試碰撞：是否並行、最大並行數
INITIAL_PARALLEL = os.getenv("INITIAL_PARALLEL", "true").lower() == "true"
INITIAL_MAX_PARALLEL = int(os.getenv("INITIAL_MAX_PARALLEL", "4"))

# 深度碰撞：嚴格錨定與錨點數
DEEP_STRICT = os.getenv("DEEP_STRICT", "true").lower() == "true"
ANCHOR_MIN = int(os.getenv("ANCHOR_MIN", "2"))
ANCHOR_MAX = int(os.getenv("ANCHOR_MAX", "6"))

_client = OpenAI()  # 從環境變數讀 OPENAI_API_KEY


# -----------------------------------------------------------------------------
# 內部：把 OpenAI stream 轉成 async 逐 token（在背景 thread 拉流）
# -----------------------------------------------------------------------------
async def _stream_chat_tokens(
    messages: List[Dict[str, str]],
    *,
    model: str = MODEL,
    temperature: float = 0.85,
    presence_penalty: float = 0.6,
    frequency_penalty: float = 0.4,
) -> AsyncGenerator[str, None]:
    """
    將 Chat Completions 的 stream=True 包成 async generator，支援多工並行。
    用背景 thread 拉取 chunk，再用主 loop 的 queue 吐出 token。
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    STOP = object()

    def worker():
        try:
            stream = _client.chat.completions.create(
                model=model,
                temperature=temperature,
                presence_penalty=presence_penalty,
                frequency_penalty=frequency_penalty,
                stream=True,
                messages=messages,
                timeout=OPENAI_TIMEOUT,
            )
            for chunk in stream:
                try:
                    delta = chunk.choices[0].delta
                    token = getattr(delta, "content", None)
                except Exception:
                    token = None
                if token:
                    loop.call_soon_threadsafe(queue.put_nowait, token)
        except Exception as e:
            # 失敗也送個提示字串，避免整段中斷
            loop.call_soon_threadsafe(queue.put_nowait, f"[生成錯誤] {e}")
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, STOP)

    threading.Thread(target=worker, daemon=True).start()

    while True:
        item = await queue.get()
        if item is STOP:
            break
        yield item


# -----------------------------------------------------------------------------
# 風格去共振：依對撞詞做 deterministic 風格指派，避免同模板
# -----------------------------------------------------------------------------
_STYLES = [
    "極簡三短句。每句 6–12 字，節奏短促，動詞優先。",
    "科幻隱喻。把產品比作艙段/推進器/模組，語意乾淨，避免濫用術語。",
    "生活小劇場。第二人稱，具體時間與場景，最後半句反轉。",
    "數據感。包含 1–2 個數字或百分比（合理虛構），避免堆疊符號。",
    "黑色幽默。輕諷、但不陰暗，句末以幽默收尾。",
    "職場隱喻。專案/迭代/里程碑/效率，語氣俐落。",
    "感官路徑。聲/色/溫/質地 交替描寫，形成節拍。",
    "運動轉播口吻。快節奏、比喻為賽點/超前分，收在 CTA。",
    "旅程隱喻。啟程/轉乘/抵達，語氣溫暖。",
    "懸疑鋪陳。先設問，再揭示利益點，收在明確行動。",
]

def _style_for_term(term: str) -> str:
    h = int(hashlib.sha1(term.encode("utf-8")).hexdigest(), 16)
    return _STYLES[h % len(_STYLES)]


# -----------------------------------------------------------------------------
# 初試碰撞（**每個對撞詞一個獨立請求**；可並行）
# -----------------------------------------------------------------------------
async def stream_short_copies(
    product_term: str,
    terms: List[str],
    lang: str = "zh-TW"
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    事件格式（SSE）：
      {"mode":"header","index":i,"term":term}
      {"mode":"delta","index":i,"token":token}
      {"mode":"end","index":i,"text":full_text}
    這版對每個 term 發起獨立 Chat，彼此無上下文；支援並行。
    """
    if not terms:
        return

    # 事件匯流 queue（多工 -> 單流）
    q: asyncio.Queue = asyncio.Queue()
    DONE = {"mode": "__done__"}

    # 併發節流
    sem = asyncio.Semaphore(INITIAL_MAX_PARALLEL if INITIAL_PARALLEL else 1)

    async def worker(i: int, term: str):
        # 宣告開稿
        await q.put({"mode": "header", "index": i, "term": term})

        # 為每個 term 分配一個風格
        style = _style_for_term(term)

        sys = (
            "你是資深廣告文案策劃。用繁體中文，每篇 90–150 字，"
            "具體、有畫面、吸引人的、非理所當然的、有時甚至是有點出乎意料之外的，避免模板句（例如『只需一按』『輕鬆享受』等）。"
            "這是一個**完全獨立**的請求，不存在任何其他對撞詞或上下文。"
        )
        user = (
            f"產品詞：{product_term}\n"
            f"對撞詞：{term}\n"
            f"風格要求：{style}\n"
            f"請寫一則以\"{product_term}\"和\"{term}\"為主題，長度約90–150 字吸引人的、且具SEO成效的短文，語言：{lang}"

        )
        messages = [
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ]

        text_acc: List[str] = []
        async with sem:
            async for token in _stream_chat_tokens(
                messages,
                temperature=1.1,
                presence_penalty=0.7,
                frequency_penalty=0.5,
            ):
                text_acc.append(token)
                await q.put({"mode": "delta", "index": i, "token": token})

        await q.put({"mode": "end", "index": i, "text": "".join(text_acc).strip()})
        await q.put(DONE)

    # 啟動所有工作
    tasks = [asyncio.create_task(worker(i, t)) for i, t in enumerate(terms)]

    # 匯流輸出
    done = 0
    total = len(tasks)
    while done < total:
        ev = await q.get()
        if ev.get("mode") == "__done__":
            done += 1
            continue
        yield ev

    # 收尾
    await asyncio.gather(*tasks, return_exceptions=True)


# -----------------------------------------------------------------------------
# 深度碰撞：從候選短文案抽錨點後擴寫（保持與候選貼合）
# -----------------------------------------------------------------------------
async def _extract_anchors(seed: str, lang: str = "zh-TW") -> List[str]:
    """
    回傳 anchors: List[str]，皆為 seed 內「原文子字串」（verbatim）。
    """
    sys = (
        "你是關鍵概念萃取器。輸出 JSON，鍵為 anchors: string[]。\n"
        "規則：\n"
        "1) 每個片語必須是原文出現的連續字串；\n"
        "2) 優先保留具意象或主題指示的詞；\n"
        "3) 長度 2–12 字；\n"
        "4) 去重，保留 3–6 個。\n"
    )
    user = f"短文案（{lang}）：\n{seed}\n請輸出 anchors JSON。"

    def _call():
        resp = _client.chat.completions.create(
            model=MODEL,
            response_format={"type": "json_object"},
            temperature=0,
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": user}],
            timeout=OPENAI_TIMEOUT,
        )
        return resp.choices[0].message.content

    try:
        text = await asyncio.to_thread(_call)
        data = json.loads(text)
        anchors = [str(x).strip() for x in (data.get("anchors") or []) if str(x).strip()]
    except Exception:
        anchors = []

    # 嚴防幻覺：只保留 seed 中真的出現過的片語
    anchors = [a for a in anchors if a and a in seed]

    # 去重並裁切
    dedup = []
    for a in anchors:
        if a not in dedup:
            dedup.append(a)
    if not dedup:
        # 保底：seed 的首尾片段
        if len(seed) > 6:
            dedup = [seed[:6].strip(), seed[-6:].strip()]
        else:
            dedup = [seed]
    return dedup[: max(ANCHOR_MIN, min(ANCHOR_MAX, len(dedup) or 0))]


def _media_guidelines(media: str) -> str:
    media = (media or "").strip()
    if not media:
        return "通用：段落清楚、避免表情符號，文末一行明確 CTA。"
    rules = {
    "Facebook 廣告": 
        "句子短，第一行必須抓住眼球；前 1–2 行帶入主題利益或痛點。全篇以 80 字為上限，1–2 個 emoji 內，適量段落斷行。結尾可加 1–2 組 #關鍵字，重點資訊可用符號突出。CTA 建議明確（如：立即了解、搶先試用）。",

    "Facebook 貼文":
        "開頭 1–2 句吸引注意、點出主題或故事；語氣親切、貼近生活。可分段描述內容，段落不宜過長，每段 2–3 行內。可用 2–3 個 emoji，強調重點或情感。結尾可加 1–3 組 #關鍵字，適度呼籲互動（如：留言、分享）。CTA 要自然融入（如：歡迎下方討論）。",

    "Facebook 限時動態":
        "內容極短、資訊直接明確，20–30 字內最佳。可大量使用 emoji、貼圖、GIF、互動貼紙（如：問答、投票、連結）。語氣口語、親民，強調即時性（如：現在限時優惠）。CTA 必須明確（如：點此搶先看、滑動查看更多）。一則可拆為多張連續動態串聯重點。",

    "Facebook 小編稿":
        "語氣可彈性依品牌形象，既可專業也可生活化。開頭帶入熱門話題、事件或趣味引言。內容結構清楚、邏輯分明，可用條列或分段。可適度插入品牌立場、觀點、幽默。emoji 建議 2 個以內，#關鍵字至多 2 組。結尾加問句或互動引導（如：你怎麼看這件事？）。適合粉絲專頁日常、活動、品牌經營。",

    "Instagram 貼文": 
        "語氣生活化、親民，有故事感。建議每 1–2 行斷行，斷行密度高。可用 2–3 個 emoji 融入文中或段落開頭。結尾加 2–3 組 #關鍵字，建議呼籲互動（如：留言分享、tag 朋友）。如有品牌標籤須置於結尾。",

    "Instagram 限時動態": 
        "內容超短（單張不超過 30 字），主題直白、用 emoji/貼圖增加動感。加互動元素如問答框、投票、滑桿。CTA 直接明確（如：往上滑、點連結）。",

    "EDM": 
        "標語 1 句+導讀 1–2 行內，主體條列 2–3 點利益或特色，每點 20 字以內。底部加按鈕式 CTA（如：立即選購、了解詳情）。可加一行提醒，如『優惠倒數』，結尾須保有聯絡方式或品牌標誌。",

    "電商商品頁": 
        "開頭 2 句明確點出核心利益或解決痛點，接著條列 3–5 點規格/功能/材質（每點 20 字以內），必要時可用 emoji 作為條列符號。CTA 簡短明確，如『立即加入購物車』『搶購優惠』。推薦補充：加入購物保障說明或快速出貨承諾。",

    "LinkedIn 貼文": 
        "專業語氣、條理分明，少 emoji（1 以內或不用），內容建議 2–3 段。舉例以數據、情境、專案成果說明。結尾提出思考問題或趨勢，並附 CTA（如：你的看法？一起交流）。避免過多標點或非正式用語。",

    "Threads 貼文": 
        "語氣輕鬆幽默，建議分段短句，適量 emoji（1–2 個），可用 hashtag 但不超過 2 組。互動性高（如提問、民調），主題貼近時事或生活感受。",

    "X（原 Twitter）": 
        "限 280 字內，主題明確、第一句重點突出。用詞簡潔直接，可用 1–2 emoji 提升吸引力。最多 2 組 #關鍵字，結尾鼓勵互動（如：你怎麼看？）。可加圖片/連結強化內容。",

    "LINE 官方貼文": 
        "用語口語、接地氣，重點資訊集中 60 字以內。建議前 1 句帶主題，接著條列利益點。可用 emoji 但不宜過多（2 個以內），CTA 簡單直接（如：點我看更多）。適合配合優惠券、快速連結。",

    "YouTube 影片描述": 
        "開頭 2–3 句概述影片亮點或關鍵問題，接著條列重點內容、相關資源或連結（如時間軸、推薦影片）。結尾呼籲訂閱/留言/分享，適當插入品牌連結或社群帳號。可配 2–3 組 #關鍵字。",

    "TikTok 短影音標題": 
        "超短句、直接描述亮點（20 字內），可用 1–2 emoji。建議加 2–3 組 #熱門標籤（如 #FYP）。若有限時活動，直接標明時間。結尾可用問句或挑戰引導互動。",

    "社群社團貼文（如 FB/LINE 社團）":
        "語氣自然，強調社群歸屬與互動。開頭先問問題或丟主題（如：大家怎麼看？），中間簡短敘述重點，建議條列易讀。可用 2 個 emoji 內，結尾邀請討論（如：歡迎留言討論）。不得過度商業導向，避免頻繁 CTA。",

    "小紅書貼文":
        "語氣輕鬆分享、真實體驗感強。多段斷行，段首可加 emoji。開頭2句勾起好奇心，內容重點條列化。結尾加2–3組#標籤，鼓勵留言互動。",

    "部落格中篇文章":
        "標題需清楚點題、可加入關鍵字。首段開頭 2–3 句總結主題與價值，接著分段深入分析，每段 100–200 字，段落之間可穿插小標題或重點條列，輔以實例或數據。語氣專業中帶溫度，可適度插入 1–2 emoji 增加親和力。結尾整理重點並加 1 行 CTA（如：歡迎留言交流）。文章長度建議 800–1500 字。"
}
    return rules.get(media, f"{media}：維持專業，句子精煉，文末 CTA。")


async def stream_deep_copies(
    product_term: str,
    candidates: List[str],
    persona: Dict[str, Any] | None = None,
    media: str = "",
    lang: str = "zh-TW",
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    深度碰撞（header/delta/end）：
    - 第一句必須延伸候選短文案的語境
    - 至少保留 ANCHOR_MIN 個 anchors 原文出現（若 DEEP_STRICT=true）
    - 媒體規則僅作調味，不可破壞 anchors 意象
    """
    persona = persona or {}
    p_name = persona.get("name") or ""
    p_age = persona.get("age") or ""
    p_role = persona.get("role") or ""
    p_pain = persona.get("pain_points") or persona.get("pain") or ""
    p_tone = persona.get("tone") or ""
    media_rule = _media_guidelines(media)

    sys = (
        "你是資深廣告文案總監。用繁體中文，根據候選短文案擴寫成 120–220 字完整稿："
        "需包含 1) 吸睛標語 2) 主體文案 3) 明確 CTA。"
        "第一句必須延伸候選短文案（沿用其場景/意象/視角），不可另起全新場景。"
        "若提供 anchors，必須原文保留至少指定數量的 anchors。"
        "避免空話與模板句。"
    )

    for i, seed in enumerate(candidates):
        yield {"mode": "header", "index": i, "term": f"候選#{i+1}"}

        anchors: List[str] = []
        if DEEP_STRICT:
            anchors = await _extract_anchors(seed, lang=lang)

        spec = (
            f"Persona：name={p_name}；age={p_age}；role={p_role}；pain_points={p_pain}；tone={p_tone}\n"
            f"發布媒體：{media or '通用'}（寫作規則：{media_rule}）\n"
            f"候選短文案（seed）：{seed}\n"
        )
        if DEEP_STRICT and anchors:
            spec += (
                f"anchors（必須原文保留 ≥{max(1, ANCHOR_MIN)} 個）：{', '.join(anchors)}\n"
                "請自然融入 anchors（逐字出現），禁止近義替換或硬貼清單。\n"
            )

        user = (
            spec +
            "輸出格式（必須使用粗體小標）：\n"
            " **標語：** ……\n"
            " **主體：** ……（依照發布媒體的寫作原則，在基於候選短文案seed 的語境以及至指定受眾(若有的話)來進行的重新書寫）\n"
            " **CTA：** ……（若是發布媒體的寫作原則有要求的話:明確動詞 + 產品詞）\n"
            f"請用 {lang}。"
        )

        messages = [
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ]

        text_acc: List[str] = []
        async for token in _stream_chat_tokens(
            messages,
            temperature=0.65,
            presence_penalty=0.5,
            frequency_penalty=0.4,
        ):
            text_acc.append(token)
            yield {"mode": "delta", "index": i, "token": token}

        yield {"mode": "end", "index": i, "text": "".join(text_acc).strip()}
