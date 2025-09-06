# app/generators/outlines.py
import json, uuid, re
from typing import Generator, List, Dict, Any
from app.models.schemas import Differentiator, TemplateInfo, Outline, Character
from ..openai_client import stream_text
role_dict={"protagonist":'主角','ally':'夥伴','mentor':'導師','antagonist':'反派','supporting':'配角'}
# ---------- 共用 ----------
def _extract_json(text: str) -> Dict[str, Any]:
    s, e = text.find("{"), text.rfind("}")
    payload = text[s:e+1] if s != -1 and e != -1 and e > s else "{}"
    try:
        return json.loads(payload)
    except Exception:
        return {}

def _norm_name(n: str) -> str:
    if not n: return "@角色"
    n = n.strip()
    return n if n.startswith("@") else "@"+n

# ---------- 提示詞：單一大綱 ----------
def single_outline_prompt(tpl: TemplateInfo, diff: Differentiator, label: str) -> List[Dict[str,str]]:
    lang_tricks = "、".join(diff.language_tricks or []) or "Refrain"
    vis_tricks  = "、".join(diff.visual_tricks or [])  or "翻頁鉤子"
    # 讓三個版本的方向真的不同
    flavors = {
        "A": "正常發展路線；衝突低強度、重視情緒與自我認同，收束在團聚或理解。",
        "B": "突破傳統窠臼；會有出乎意料的發展，讓人難以猜測後續的劇情。",
        "C": "相較於角色間的互動，更重視角色內心世界的想法。"
    }
    flavor = flavors.get(label.upper(), flavors["A"])

    sys = ("你是個有著20年童書創作經驗才華洋溢的資深童書編劇，你擅長從孩子的觀點與角度看這個世界，也會孩子聽得懂的方式來讓他們了解這世界的殘酷。僅輸出 JSON，不要 Markdown、不要多餘說明。")
    user = f"""
請根據以下素材寫出「單一版本」童書大綱(長度約150~200字，要涵蓋大致上的劇情走向，以及主要出場人物間的關係，出場人物名稱前都有@)（label={label}）。讀者年齡 {diff.age_range} 歲、語氣 {diff.tone}。
套用套路：{tpl.name}（{tpl.category}）。場景／文化：{diff.setting}。主題：{diff.theme}。
語言套路：{lang_tricks}；視覺套路：{vis_tricks}。
風格差異指示：{flavor}

### 請輸出 JSON（必填欄位）
{{
  "title": "吸睛書名",
  "logline": "150~200字，要涵蓋大致上的劇情走向，以及主要出場人物間的關係。",
  "cast": [
    {{"name":"@name1","role":"protagonist","description":"20-40字特質與動機","appearance_prompt":"可用於定裝的外觀摘要"}},
    {{"name":"@name2","role":"ally","description":"...","appearance_prompt":"..."}},
    {{"name":"@name3","role":"mentor","description":"...","appearance_prompt":"..."}},
    {{"name":"@name4","role":"antagonist","description":"...（不過度恐怖，適齡）","appearance_prompt":"..."}},
    {{"name":"@name5","role":"supporting","description":"可選","appearance_prompt":"可選"}}
  ],
  "beats": [
    "1. 開場建立場景與主角目標，@主角。",
    "2. ...",
    "... 直到 14 條，每條20-50字，包含@名字(一個或多個)與場景/情緒線索。14條整合來看是完整的故事，而劇情的發展也和你之前選的套路節奏一致",
    "14. 溫暖收束，呼應主題。"
  ]
}}

### 規範
- cast 需 4–6 名；角色 name 一律含 @；role 僅能取：protagonist/ally/mentor/antagonist/supporting。
- beats 必須 **正好 14 條**，符合 {tpl.name} 的敘事節點，但每條都要在「場景或情緒」上可視化（日/夜/天氣/位置等）。
- 整體避免說教與口號；文字簡潔清楚、適齡。
"""
    return [{"role":"system","content":sys},{"role":"user","content":user}]

def stream_outline_tokens(tpl: TemplateInfo, diff: Differentiator, label: str) -> Generator[str, None, None]:
    for tok in stream_text(single_outline_prompt(tpl, diff, label)):
        yield tok

# 你檔案裡的 import 已有 uuid；若沒有請加： import uuid

def parse_outline_json(text: str) -> Outline:
    data = _extract_json(text)
    title   = data.get("title", "").strip() or "故事大綱"
    logline = data.get("logline", "").strip()

    cast_in  = data.get("cast", []) or []
    cast_out = []
    for i, c in enumerate(cast_in, start=1):
        name = _norm_name(str(c.get("name") or f"角色{i}"))
        role = (c.get("role") or "supporting").strip()
        if role not in {"protagonist","ally","mentor","antagonist","supporting"}:
            role = "supporting"
        desc = (c.get("description") or c.get("bio") or "").strip()
        app  = (c.get("appearance_prompt") or c.get("appearance") or "").strip()
        # ✅ 這行是關鍵：補一個 id，避免 Pydantic 報「id 缺少」
        cast_out.append({
            "id": str(uuid.uuid4()),              # <--- 新增
            "name": name,
            "role": role,
            "description": desc,
            "appearance_prompt": app
        })

    beats_in = data.get("beats", []) or []
    beats = []
    for b in beats_in:
        if isinstance(b, str):
            beats.append(b.strip(" \n"))
        elif isinstance(b, dict):
            beats.append((b.get("text") or "").strip())
    beats = [x for x in beats if x][:14]
    while len(beats) < 14:
        beats.append(f"{len(beats)+1}. （保留名額，用於後續擴寫）")

    return Outline(
        id=str(uuid.uuid4()),
        title=title,
        logline=logline,
        cast=[Character(**c) for c in cast_out],  # 現在有 id，不會噴錯
        beats=beats
    )

# ---- 若缺 beats，以現有角色快速補齊 14 條 ----
def generate_beats_from_cast(tpl: TemplateInfo, diff: Differentiator, cast: List[Character]) -> List[str]:
    names = ", ".join([c.name for c in cast])
    sys = "你是個有著20年童書創作經驗才華洋溢的資深童書編劇，。僅輸出 JSON。"
    user = f"""
依下列角色寫出 **14 條** beats（每條20-50字），每條必須包含至少一個 @角色名，並帶出可視化場景資訊（例：黃昏/雨天/橋上/水邊等）。
角色：{names}
主題：{diff.theme}；場景：{diff.setting}；讀者年齡：{diff.age_range}；語氣：{diff.tone}

輸出 JSON：{{"beats":["1. ...","2. ...","...","14. ..."]}}
"""
    buf=[]
    for tok in stream_text([{"role":"system","content":sys},{"role":"user","content":user}]):
        buf.append(tok)
    data = _extract_json("".join(buf))
    beats = data.get("beats", []) or []
    beats = [b if isinstance(b,str) else b.get("text","") for b in beats]
    beats = [x.strip() for x in beats if x][:14]
    while len(beats)<14:
        beats.append(f"{len(beats)+1}. （待補）")
    return beats
