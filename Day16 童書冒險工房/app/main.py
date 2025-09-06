# app/main.py — fixed routes & output dir alias
import os, json, uuid, base64, re
import time, shutil
from pathlib import Path
from typing import Dict, Any, List
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from threading import Thread
from queue import Queue, Empty

from app.models.schemas import Differentiator, TemplateInfo, Outline, Character
from app.models import store
from app.generators.outlines import (
    stream_outline_tokens, parse_outline_json,
    generate_beats_from_cast
)

from pydantic import BaseModel
from app.generators.storyboard import outline_to_spreads
from app.generators.images import generate_image_stream
from app.generators.tts import tts_stream
from app.generators.video import build_video
from app.exporters.pdf_export import export_pdf
from app.exporters.epub_export import export_epub
from app.openai_client import image_to_file, stream_text
from fastapi import Query
from .streaming import router as stream_router

import sys, asyncio

if sys.platform.startswith("win"):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

load_dotenv()
PORT = int(os.getenv("PORT", "7860"))

app = FastAPI(title="Story Adventure Studio")
BASE_DIR = os.path.dirname(__file__)


# ---------- Static & Output (no-cache) ----------
class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        resp.headers["Cache-Control"] = "no-store, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp


OUTPUT_ROOT = Path(__file__).parent / "output"
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR = str(OUTPUT_ROOT)
app.mount("/output", NoCacheStaticFiles(directory=str(OUTPUT_ROOT)), name="output")

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# 其餘路由（SSE）
app.include_router(stream_router)

DATA_DIR = os.path.join(BASE_DIR, "templates_data")


def extract_json2(txt: str) -> str:
    s, e = txt.find("{"), txt.rfind("}")
    return txt[s:e + 1] if s != -1 and e != -1 and e > s else ""


# ---------------- util ----------------
def sse_event(name: str, payload) -> str:
    data = json.dumps(payload, ensure_ascii=False) if not isinstance(payload, str) else payload
    return f"event: {name}\n" + f"data: {data}\n\n"


def load_templates():
    items = []
    for fn in os.listdir(DATA_DIR):
        if fn.endswith(".json"):
            with open(os.path.join(DATA_DIR, fn), "r", encoding="utf-8") as f:
                items.append(json.load(f))
    return items


def sse(obj: Dict[str, Any]) -> str:
    return "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"


def _decode_b64_param(d: str) -> str:
    s = d.strip().replace(' ', '+').replace('-', '+').replace('_', '/')
    pad = (-len(s)) % 4
    if pad: s += '=' * pad
    raw = base64.b64decode(s)
    return raw.decode("utf-8")


def ensure_dir(p): os.makedirs(p, exist_ok=True)


def extract_json(text: str) -> str:
    start = text.find("{");
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]
    return text


# ---- 物種推斷（中文關鍵詞）----
SPECIES_KEYWORDS = [
    "蝌蚪", "青蛙", "蛙", "魚", "小魚", "鴨", "小鴨", "鴨子", "企鵝", "烏龜", "海馬", "海豚", "鯨魚",
    "貓", "狗", "熊", "熊貓", "狐狸", "兔", "老虎", "獅子", "龍", "恐龍",
    "章魚", "水母", "螃蟹", "昆蟲", "甲蟲", "小朋友", "小男孩", "小女孩", "人類"
]


def infer_species(text: str) -> str:
    for kw in SPECIES_KEYWORDS:
        if kw in text: return kw
    m = re.search(r"@?([^\s]{1,8})(青蛙|小魚|小鳥|小鴨|小貓|小狗|鴨子|企鵝|烏龜)", text)
    return m.group(0).replace("@", "") if m else ""


def _default_appearance(c: Dict[str, Any], diff: Dict[str, Any]) -> str:
    setting = diff.get("setting", "");
    age = diff.get("age_range", "3-6")
    tone = diff.get("tone", "溫暖");
    role = c.get("role", "");
    desc = c.get("description", "")
    nm = c.get("name", "角色")
    return f"{nm} 的外觀：{desc}；定位：{role}；場景：{setting}；適齡：{age}；語氣：{tone}"


# ---- 依文本偵測出場角色 ----
def detect_scene_characters(text: str, characters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    found = []
    for ch in characters:
        nm = ch.get("name", "").strip()
        if not nm: continue
        if nm in text or nm.lstrip("@") in text: found.append(ch)
    return found


# ---- 多樣化分鏡（時間/季節/天氣/鏡頭/構圖/角色組合） ----
def diversify_spreads(spreads: List[Dict[str, Any]], characters: List[Dict[str, Any]], diff: Dict[str, Any],
                      style: str) -> List[Dict[str, Any]]:
    times = ["清晨柔光", "上午日光", "正午高光", "午後逆光", "黃昏金色時刻", "夜晚月光", "陰天柔霧", "暴雨", "雨後彩虹",
             "霧晨", "室內暖光", "水下陽光", "營火夜色", "海邊晚霞"]
    weathers = ["晴", "晴", "晴", "晴", "晴", "夜", "陰", "雨", "雨後", "霧", "室內", "水下", "夜", "晴"]
    seasons = ["春", "夏", "秋", "冬"] * 4
    shots = ["遠景建立", "中景雙人", "特寫", "過肩視角", "俯視", "仰視", "跟拍", "全景", "剪影背光", "倒影構圖",
             "三分法", "居中對稱", "前景遮擋", "留白構圖"]
    comps = ["三分法", "居中", "對角線引導", "框中框", "對稱", "前景/中景/背景層次", "留白", "低視角", "高視角",
             "S型引導", "三角構圖", "對稱", "三分法", "居中"]

    roles = {"protagonist": [], "ally": [], "antagonist": [], "mentor": [], "supporting": []}
    for c in characters:
        roles.setdefault(c.get("role", "supporting"), []).append(c)

    def pick(role, fallback=None):
        arr = roles.get(role) or []
        if arr: return [arr[0]]
        return [fallback] if fallback else []

    hard_rules = ("嚴禁任何文字/字幕/標語/對話框/字母；白平衡中性，顏色乾淨明亮，避免復古/泛黃；"
                  "畫風與全書一致，角色臉型與服裝一致（on‑model）。")
    art_style = style.strip() or "童書繪本風，乾淨明亮色彩，固定光源，紙張顆粒細膩，柔和但不泛黃。"
    setting = diff.get("setting", "")

    for i, sp in enumerate(spreads):
        raw_text = (sp.get("summary", "") + " " + sp.get("display_text", "") + " " + sp.get("image_prompt", "")).strip()
        present = detect_scene_characters(raw_text, characters)
        if not present:
            plan = [
                pick("protagonist"),
                pick("protagonist") + pick("mentor"),
                pick("protagonist") + pick("ally"),
                pick("antagonist") or pick("protagonist"),
                (roles.get("ally")[:1] or pick("protagonist")) + pick("mentor"),
                (roles.get("ally")[:1] or []) + (roles.get("protagonist")[:1] or []),
                pick("protagonist") + pick("antagonist"),
                pick("protagonist"),
                pick("protagonist") + pick("ally") + pick("mentor"),
                pick("antagonist"),
                pick("protagonist") + pick("ally"),
                pick("mentor"),
                pick("protagonist"),
                roles.get("ally")[:1] + roles.get("protagonist")[:1] + roles.get("mentor")[:1]
            ]
            present = plan[i % len(plan)]

        sp["characters"] = [c["name"] for c in present if c]
        tod = times[i % len(times)];
        weather = weathers[i % len(weathers)]
        season = seasons[i % len(seasons)];
        shot = shots[i % len(shots)]
        comp = comps[i % len(comps)]

        char_lines = []
        for c in present:
            if not c: continue
            ap = c.get("appearance_prompt") or _default_appearance(c, diff)
            char_lines.append(f"{c.get('name')}: {ap}")
        char_block = "；".join(char_lines) if char_lines else "依劇情需要安排人物。"

        scene_line = f"場景：{setting}；季節：{season}；天氣：{weather}；時間：{tod}。"
        camera_line = f"鏡頭：{shot}；構圖：{comp}；視角以兒童視線高度為主，構圖清晰易讀。"
        beat_line = f"劇情要點：{sp.get('summary') or sp.get('display_text', '')}"
        style_line = f"全書風格：{art_style}。顏色乾淨、光線自然；避免任何泛黃/舊紙質感。"

        sp["time_of_day"] = tod;
        sp["weather"] = weather;
        sp["season"] = season
        sp["camera"] = shot;
        sp["composition"] = comp
        sp["image_prompt"] = " | ".join([
            style_line, scene_line, camera_line,
            f"出場角色：{char_block}",
            beat_line,
            f"規則：{hard_rules}"
        ])
    return spreads


# --- TTS 前置清理 ---
_page_prefix = re.compile(r'^\s*(?:[#＃]?\s*\d+|第\s*\d+\s*頁)\s*[:：、．\.]?\s*', re.I)
_inline_page = re.compile(r'第\s*\d+\s*頁', re.I)


def clean_tts_text(text: str, page: int) -> str:
    if not text: return ""
    t = _page_prefix.sub("", text)
    t = _inline_page.sub("", t)
    t = t.replace("@", "")
    t = re.sub(r'\s+', ' ', t)
    return t.strip()


# ---------------- routes ----------------
@app.get("/")
def index():
    with open(os.path.join(BASE_DIR, "static", "index.html"), "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.get("/api/templates")
def api_templates(): return {"templates": load_templates()}


@app.post("/api/project/new")
def api_new_project():
    pid = store.new_project()
    return {"project_id": pid}


@app.get("/api/project/{pid}")
def api_get_project(pid: str):
    return store.get_project(pid)


# --------- 大綱三路並行串流（只回 title/logline）-----------
@app.get("/api/outlines_stream/{pid}/{template_key}")
def api_outlines_stream(pid: str, template_key: str, d: str):
    import time, re
    from queue import Queue, Empty
    def error_stream(msg: str):
        def gen():
            yield sse({"status": "start"})
            yield sse({"status": "error", "error": msg})

        return StreamingResponse(gen(), media_type="text/event-stream")

    # 解析差異化
    try:
        diff_data = json.loads(_decode_b64_param(d))
    except Exception as e:
        return error_stream(f"decode diff failed: {e}")
    try:
        diff = Differentiator(**diff_data)
        tpls = {t['key']: t for t in load_templates()}
        if template_key not in tpls:
            return error_stream(f"template_key '{template_key}' not found")
        tpl = TemplateInfo(**tpls[template_key])
    except Exception as e:
        return error_stream(f"bad payload: {e}")

    q = Queue()
    results = [None, None, None]
    buffers = ["", "", ""]

    title_re = re.compile(r'"title"\s*:\s*"([^"]{1,160})"', re.S)
    logline_re = re.compile(r'"logline"\s*:\s*"([^"]{10,400})"', re.S)
    cast_re = re.compile(
        r'"name"\s*:\s*"([^"]+)"\s*,\s*"role"\s*:\s*"(protagonist|ally|mentor|antagonist|supporting)"', re.S
    )

    def runner(idx: int, label: str):
        last_emit = 0.0
        try:
            for tok in stream_outline_tokens(tpl, diff, label):
                buffers[idx - 1] += tok
                now = time.time()
                if now - last_emit > 0.12:
                    buf = buffers[idx - 1]
                    t = title_re.search(buf);
                    l = logline_re.search(buf);
                    c = cast_re.findall(buf)[:6]
                    payload = {
                        "outline": idx, "stage": "delta",
                        "title": t.group(1) if t else None,
                        "logline": l.group(1) if l else None,
                        "cast": [{"name": n, "role": r} for (n, r) in c]
                    }
                    q.put(payload);
                    last_emit = now

            outline = parse_outline_json(buffers[idx - 1]).model_dump()
            results[idx - 1] = outline
            q.put({
                "outline": idx, "stage": "complete",
                "title": outline.get("title", ""),
                "logline": outline.get("logline", ""),
                "cast": [{"name": c.get("name", ""), "role": c.get("role", "")} for c in outline.get("cast", [])]
            })
        except Exception as e:
            q.put({"outline": idx, "stage": "error", "error": str(e)})

    for i, label in enumerate(["A", "B", "C"], start=1):
        Thread(target=runner, args=(i, label), daemon=True).start()

    def event_stream():
        yield sse({"status": "start"})
        finished = 0;
        last_ping = time.time()
        try:
            while finished < 3:
                try:
                    msg = q.get(timeout=0.5)
                    yield sse(msg)
                    if msg.get("stage") in ("complete", "error"):
                        finished += 1
                except Empty:
                    if time.time() - last_ping > 15:
                        yield ": keep-alive\n\n";
                        last_ping = time.time()
                        continue
        except (BrokenPipeError, ConnectionResetError):
            return
        finally:
            try:
                p = store.get_project(pid)
                p['outlines'] = [r for r in results if r is not None]
                p['diff'] = diff_data
                p['template_key'] = template_key
                store.put_project(pid, p)
                yield sse({"status": "done"})
            except Exception:
                pass

    resp = StreamingResponse(event_stream(), media_type="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Connection"] = "keep-alive"
    resp.headers["X-Accel-Buffering"] = "no"
    return resp


# 選定某一大綱 → 人物自動帶入選角
@app.post("/api/adopt_outline/{pid}/{outline_index}")
def api_adopt_outline(pid: str, outline_index: int):
    p = store.get_project(pid)
    outlines = p.get("outlines", [])
    if not outlines or outline_index < 0 or outline_index >= len(outlines):
        return {"ok": False, "error": "outline index out of range"}

    chosen = outlines[outline_index]
    diff = p.get("diff", {})
    chars = p.get("characters", [])
    exists = {(c.get('name') or '').strip() for c in chars}

    for c in chosen.get("cast", []):
        nm = (c.get("name") or "角色").strip()
        if nm not in exists:
            appearance = c.get("appearance_prompt") or c.get("appearance") or \
                         f"{nm} 的外觀：{c.get('description', '')}；定位：{c.get('role', 'supporting')}"
            chars.append({
                "id": str(uuid.uuid4()),
                "name": nm,
                "role": c.get("role", "supporting"),
                "description": c.get("description", ""),
                "appearance_prompt": appearance,
                "voice": "alloy"
            })
            exists.add(nm)

    p['characters'] = chars
    p['chosen_outline'] = outline_index
    p.pop("storyboard", None)  # 讓舊分鏡失效

    store.put_project(pid, p)
    return {"ok": True, "characters": chars}


# 全書美學風格
@app.get("/api/style/{pid}")
def api_get_style(pid: str): return {"style": store.get_project(pid).get("style", "")}


@app.put("/api/style/{pid}")
async def api_set_style(pid: str, req: Request):
    data = await req.json()
    p = store.get_project(pid);
    p['style'] = data.get("style", "")
    store.put_project(pid, p);
    return {"ok": True}


# ---- Characters CRUD ----
@app.get("/api/characters/{pid}")
def api_char_list(pid: str): return {"characters": store.get_project(pid).get("characters", [])}


@app.post("/api/characters/{pid}")
async def api_char_add(pid: str, req: Request):
    data = await req.json();
    data['id'] = str(uuid.uuid4())
    p = store.get_project(pid);
    chars = p.get("characters", []);
    chars.append(data)
    p['characters'] = chars;
    p.pop("storyboard", None);
    store.put_project(pid, p)
    return {"ok": True, "character": data}


@app.put("/api/characters/{pid}/{cid}")
async def api_char_edit(pid: str, cid: str, req: Request):
    data = await req.json()
    p = store.get_project(pid);
    chars = p.get("characters", [])
    for c in chars:
        if c['id'] == cid: c.update(data)
    p['characters'] = chars;
    p.pop("storyboard", None);
    store.put_project(pid, p)
    return {"ok": True}


@app.delete("/api/characters/{pid}/{cid}")
def api_char_delete(pid: str, cid: str):
    p = store.get_project(pid)
    p['characters'] = [c for c in p.get("characters", []) if c['id'] != cid]
    p.pop("storyboard", None);
    store.put_project(pid, p)
    return {"ok": True}


# ---- 角色定裝造型（SSE）----
@app.get("/api/gen/char_image/{pid}/{cid}")
def api_gen_char_image(pid: str, cid: str):
    p = store.get_project(pid)
    char = next((c for c in p.get("characters", []) if c.get("id") == cid), None)
    if not char:
        def gen_err():
            yield sse({"stage": "error", "error": "character not found"})

        return StreamingResponse(gen_err(), media_type="text/event-stream")

    diff = p.get("diff", {})
    style = (p.get("style", "") or
             "童書繪本統一風格：手繪水彩、乾淨明亮配色、固定光源、紙張顆粒細膩；白平衡中性，不要復古/泛黃；角色 on‑model。")

    name = char.get("name", "角色");
    role = char.get("role", "supporting")
    desc = char.get("description", "");
    look = char.get("appearance_prompt") or f"{name} 的外觀：{desc}；定位：{role}"
    species = infer_species(f"{name} {desc} {look}");
    setting = diff.get("setting", "")

    hard_rules = "定裝照中只允許一個角色出現，嚴禁任何文字/字幕/標語/對話框；白平衡中性、乾淨明亮，不要泛黃；正面或 3/4 側身；背景簡潔；後續頁面需保持臉型/服裝一致（on‑model）。"

    prompt = f"""{style}
角色定裝圖：{name}（{role}）
物種/形象：{species or "依名稱與描述判斷；不得與 @名 矛盾"}
個性要點：{desc}
外觀要點：{look}
場景/文化：{setting}
規則：{hard_rules}
"""

    out_dir = os.path.join(OUTPUT_DIR, pid, "characters")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{cid}.png")

    def event_stream():
        try:
            yield sse({"stage": "start", "cid": cid})
            image_to_file(prompt, out_path)
            yield sse({"stage": "saved", "cid": cid, "path": out_path})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as e:
            yield sse({"stage": "error", "cid": cid, "error": str(e)})
        finally:
            yield sse({"stage": "done", "cid": cid})

    resp = StreamingResponse(event_stream(), media_type="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Connection"] = "keep-alive"
    resp.headers["X-Accel-Buffering"] = "no"
    return resp


# ---- 重寫分鏡 ----
# --- 清掉現有分鏡（供前端在重寫前呼叫） ---


@app.delete("/api/storyboard/{pid}")
def api_clear_storyboard(pid: str):
    p = store.get_project(pid)
    if "storyboard" in p:
        p.pop("storyboard", None)
        store.put_project(pid, p)
    return {"ok": True}


class RewriteNotes(BaseModel):
    notes: str = ""


@app.post("/api/stream/rewrite_storyboard/{pid}")
async def api_stream_rewrite_storyboard(pid: str, payload: RewriteNotes):
    p = store.get_project(pid)
    if "storyboard" not in p:
        def gen_err():
            yield sse_event("done", {"status": "error", "error": "storyboard not found"})

        return StreamingResponse(gen_err(), media_type="text/event-stream")

    current_sb = p["storyboard"]
    style = p.get("style", "") or "童書風，乾淨明亮，不泛黃"
    notes = payload.notes or ""

    prompt = f"""你是兒童繪本分鏡師。以下是目前的 14 跨頁分鏡（JSON），以及使用者的意見。請依意見重寫分鏡：
- 保持頁數為 14，不更動主要角色（@名稱需沿用）
- 每頁輸出欄位：page, summary, display_text, characters(陣列), time_of_day, weather, season, camera, composition, sfx_tags(陣列), image_prompt
- display_text 10–18 字、非對話、不口號
- image_prompt 必須包含場景（日/夜/季節/天氣）、鏡頭/構圖、動作情緒；遵守全書風格：{style}
- 嚴禁任何文字/對話框；避免復古/泛黃；角色 on‑model
- 僅輸出 JSON：{{"spreads":[...]}}，不要多餘說明

【目前分鏡 JSON】
{json.dumps(current_sb, ensure_ascii=False)}

【使用者意見】
{notes}
"""

    # def extract_json2(txt: str) -> str:
    #     s, e = txt.find("{"), txt.rfind("}")
    #     return txt[s:e + 1] if s != -1 and e != -1 and e > s else ""

    def event_stream():
        # 先把舊分鏡從專案狀態清掉，讓 UI 乾淨
        proj = store.get_project(pid);
        proj.pop("storyboard", None);
        store.put_project(pid, proj)

        buf = []
        last_snap = 0.0
        try:
            for tok in stream_text([
                {"role": "system", "content": "你會精準輸出 JSON。"},
                {"role": "user", "content": prompt}
            ]):
                t = str(tok)
                buf.append(t)
                # token：每個都丟
                yield sse_event("storyboard_token", {"text": t})

                # snapshot：節流 180ms
                now = time.time()
                if now - last_snap > 0.18:
                    yield sse_event("storyboard_snapshot", {"text": "".join(buf)})
                    last_snap = now
        except (BrokenPipeError, ConnectionResetError):
            return
        finally:
            # 嘗試解析最終 JSON，落盤 14 頁
            raw = "".join(buf)

            try:
                obj = json.loads(extract_json2(raw))
                spreads = obj.get("spreads", [])
                fixed = []
                for i, sp in enumerate(spreads[:14], start=1):
                    sp["page"] = i;
                    fixed.append(sp)
                while len(fixed) < 14:
                    fixed.append({"page": len(fixed) + 1, "summary": "", "display_text": "", "characters": [],
                                  "image_prompt": ""})
                proj2 = store.get_project(pid)
                proj2["storyboard"] = {"spreads": fixed}
                store.put_project(pid, proj2)
            except Exception:
                # 即使 parse 失敗也要結束 stream，讓前端 fallback 或顯示 raw
                pass

            yield sse_event("done", {"status": "done"})

    resp = StreamingResponse(event_stream(), media_type="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Connection"] = "keep-alive"
    resp.headers["X-Accel-Buffering"] = "no"
    return resp


@app.post("/api/storyboard/{pid}/rewrite")
async def api_rewrite_storyboard(pid: str, payload: RewriteNotes):
    p = store.get_project(pid)
    if "storyboard" not in p:
        return {"ok": False, "error": "storyboard not found."}
    notes = (payload.notes or "").strip()
    # 最新角色名冊（供 LLM 參考並取代舊角色）
    roster = [
        {
            "name": (c.get("name") or "").strip(),
            "role": c.get("role", "supporting"),
            "personality": c.get("description", ""),
            "appearance": c.get("appearance_prompt", "")
        }
        for c in p.get("characters", [])
    ]
    diff = p.get("diff") or {}
    if "storyboard" not in p:
        return {"ok": False, "error": "storyboard not found. 請先點『由已選大綱＋角色 → 分鏡』"}

    current_sb = p["storyboard"]
    style = p.get("style", "") or "童書風，乾淨明亮，不泛黃"

    prompt = f"""你是有20年經驗的兒童繪本編劇，你能從孩子的角度挖掘這世界。請根據「使用者意見」以及「最新角色名冊」（請注意，現有分鏡劇本中若有未出現在「最新角色名冊」中的角色應該要刪除戲份，也應該要給予新進角色合理的劇情設定）以及以下規範來重寫
        14頁分鏡劇本：
        - 頁數固定14。
        - 若『使用者意見』與『目前分鏡』矛盾，以『使用者意見』為準。
        - 每頁輸出欄位：page, summary, display_text, characters(陣列), time_of_day, weather, season, camera, composition, sfx_tags(陣列), image_prompt
        - display_text
        15–30字、非對話、不口號；人物以 @角色名稱表示，所有的代名詞也必須清楚對應到 @角色名稱且名稱必須來自『角色名冊』。
        - image_prompt
        必須呼應人物外觀 / 個性 / 場景（含日 / 夜 / 季節 / 天氣、鏡頭 / 構圖），並遵守全書風格：{style}
        - 嚴禁任何文字 / 對話框；避免復古 / 泛黃；
        - 僅輸出
        JSON：{{"spreads": [...]}}（不要多餘說明）
        
        【使用者意見】
        {notes}
        【最新角色名冊
        JSON】
        {json.dumps(roster, ensure_ascii=False)}
        
        【差異化設定
        JSON】
        {json.dumps(diff, ensure_ascii=False)}
        
        【目前分鏡
        JSON】
        {json.dumps(current_sb, ensure_ascii=False)}
        """
    messages = [
        {"role": "system", "content": "你會精準以 JSON格式回答。"},
        {"role": "user", "content": prompt}]

    buf = []
    for tok in stream_text(messages):
        buf.append(tok)
    raw = "".join(buf)
    fixed = []
    try:
        obj = json.loads(extract_json2(raw))
        spreads = obj.get("spreads", [])[:14]

        for i, sp in enumerate(spreads[:14], start=1):
            sp["page"] = i;
            fixed.append(sp)
        while len(fixed) < 14:
            fixed.append(
                {"page": len(fixed) + 1, "summary": "", "display_text": "", "characters": [], "image_prompt": ""})


        fixed= diversify_spreads(p['spreads'],
                                          store.get_project(pid).get("characters", []),
                                          store.get_project(pid).get("diff", {}),
                                          store.get_project(pid).get("style", ""))
        p["storyboard"] = {"spreads": fixed}
        store.put_project(pid, p)
        return {"ok": True, "storyboard": p["storyboard"]}
    except Exception as e:
        return {"ok": False, "error": f"parse rewrite failed: {e}"}
    finally:
        raw = "".join(buf)
        json_txt = extract_json2(raw)
        try:
            obj = json.loads(extract_json2(raw))
            spreads = obj.get("spreads", [])
            fixed = []
            for i, sp in enumerate(spreads[:14], start=1):
                sp["page"] = i;
                fixed.append(sp)
            while len(fixed) < 14:
                fixed.append(
                    {"page": len(fixed) + 1, "summary": "", "display_text": "", "characters": [], "image_prompt": ""})

            # ❷ 關鍵：重建每頁提示與出場角色，避免之後生圖抓不到定裝照
            fixed = diversify_spreads(
                fixed,
                p.get("characters", []),
                p.get("diff", {}),
                p.get("style", "")
            )

            p["storyboard"] = {"spreads": fixed}
            store.put_project(pid, p)
            return {"ok": True, "storyboard": p["storyboard"]}
        except Exception:
            pass

# ---- 由大綱→分鏡（14 頁） ----
@app.post("/api/storyboard/{pid}/{outline_index:int}")
def api_build_storyboard(pid: str, outline_index: int):
    p = store.get_project(pid)
    outline = p['outlines'][outline_index]

    if not outline.get("beats"):
        tpls = {t['key']: t for t in load_templates()}
        tpl_key = p.get("template_key")
        if tpl_key and tpl_key in tpls:
            tpl = TemplateInfo(**tpls[tpl_key])
            diff = Differentiator(**(p.get("diff") or {}))
            cast = [Character(**c) for c in p.get("characters", [])] or [Character(**c) for c in
                                                                         outline.get("cast", [])]
            outline['beats'] = generate_beats_from_cast(tpl, diff, cast)
            p['outlines'][outline_index] = outline
            store.put_project(pid, p)

    from app.models.schemas import Outline as OL, Character as CH
    ol = OL(id=outline.get('id', str(uuid.uuid4())),
            title=outline['title'], logline=outline['logline'],
            cast=[CH(**c) for c in outline.get('cast', [])], beats=outline['beats'])
    sb = outline_to_spreads(ol, 14).model_dump()
    sb['spreads'] = diversify_spreads(sb['spreads'],
                                      store.get_project(pid).get("characters", []),
                                      store.get_project(pid).get("diff", {}),
                                      store.get_project(pid).get("style", ""))
    p['storyboard'] = sb
    store.put_project(pid, p)
    return p['storyboard']


# ---- 圖像生成（SSE）----
# --- 放在 main.py，完整替換原本的 api_gen_image ---
@app.get("/api/gen/image/{pid}/{page}")
def api_gen_image(pid: str, page: int):
    """
    最終出圖強化：
    - 以
    storyboard
    當頁
    image_prompt
    為基底
    - 永遠把「全書風格」與「16: 9
    跨頁規則」前置
    - 角色鎖定：名字正規化、物種 / 外觀寫死、負向約束（不得變更物種）
    - 若該頁抓不到角色，回退：先文字偵測，再用主角
    - 有定裝照就帶
    ref_images（多張可同時參考）
    """
    p = store.get_project(pid)
    spread = [s for s in p['storyboard']['spreads'] if s['page'] == page][0]

    def _same_name(a, b):
        return (a or '').strip().lstrip('@') == (b or '').strip().lstrip('@')

    # 1) 決定當頁出場角色（最嚴謹：characters -> 文字偵測 -> 主角回退）
    present = []
    if spread.get("characters"):
        for nm in spread["characters"]:
            for c in p.get("characters", []):
                if _same_name(c.get("name"), nm):
                    present.append(c)
    if not present:
        raw_text = " ".join([spread.get("summary", ""), spread.get("display_text", ""), spread.get("image_prompt", "")])
        present = detect_scene_characters(raw_text, p.get("characters", []))  # ← 文字偵測
    if not present:
        pro = next((c for c in p.get("characters", []) if c.get("role") == "protagonist"), None)
        if pro: present = [pro]

    # 2) 收集定裝照參考
    ref_images = []
    for c in present:
        cand = os.path.join(OUTPUT_DIR, pid, "characters", f"{c['id']}.png")
        if os.path.exists(cand): ref_images.append(cand)

    # 3) 風格與跨頁規則（前置）
    style = (p.get("style") or "").strip()
    style_line = f"全書美學風格：{style}" if style else "全書美學風格：童書繪本一致性，乾淨明亮、白平衡中性。"
    spread_rules = (
        "畫面比例 16:9 橫式、雙跨頁構圖；中央溝槽(gutter)留 5–7% 安全區；"
        "關鍵角色與焦點避開中線；嚴禁任何文字/字幕/對話框；避免復古/泛黃。"
    )

    # 4) 角色鎖定（物種＋外觀＋負向約束）
    def _species_of(c):
        sp = (c.get("species") or "").strip()
        if not sp:
            sp = infer_species(" ".join([c.get("name", ""), c.get("description", ""), c.get("appearance_prompt", "")]))
        return sp

    diff = p.get("diff", {}) or {}
    lock_lines = []
    forbid_common = "所有角色不得變更物種；需與定裝照一致（on‑model）。"
    for c in present:
        nm = c.get("name", "角色")
        look = c.get("appearance_prompt") or _default_appearance(c, diff)
        spc = _species_of(c)
        extra = ""
        # 兩棲/魚類 → 常見誤判補槓桿（避免變兔子/貓/狗/人類）
        if any(k in (spc or "") for k in ["蝌蚪", "青蛙", "兩棲", "魚"]):
            extra = "嚴禁出現哺乳動物特徵（毛皮、長耳、鬍鬚、乳房），不得畫成兔/貓/狗/人類。皮膚應為濕潤光滑，無毛。"
        lock_lines.append(f"{nm}｜物種：{spc or '依定裝照與描述判斷'}｜外觀要點：{look}。{extra}")
    char_lock = " | ".join(lock_lines + [forbid_common])

    # 5) 最終 prompt（在原本 image_prompt 之前，加上前述三大段）
    base_prompt = spread.get("image_prompt", "")
    final_prompt = "\n".join([style_line, spread_rules, char_lock, base_prompt]).strip()

    out_dir = os.path.join(OUTPUT_DIR, pid, "images")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, f"{int(page):02d}.png")

    def sse(obj):
        return "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"

    def event_stream():
        yield sse({"stage": "start", "page": page})
        saved_flag = False
        out_file = os.path.join(out_dir, f"{int(page):02d}.png")

        try:
            for msg in generate_image_stream(
                    pid, page, final_prompt, out_dir,
                    ref_images=ref_images, size="1792x1024"
            ):
                # 轉發訊息，同時檢查是否已經送過 saved
                if isinstance(msg, dict):
                    if msg.get("stage") == "saved":
                        saved_flag = True
                    yield sse(msg)
                else:
                    try:
                        m = json.loads(msg)
                        if isinstance(m, dict) and m.get("stage") == "saved":
                            saved_flag = True
                    except Exception:
                        pass
                    yield sse(msg)
        except (BrokenPipeError, ConnectionResetError):
            return
        finally:
            # 圖生好了但上游沒發 saved → 我們補發一次，並寫相容檔名
            if os.path.exists(out_file):
                alt_unpadded = os.path.join(out_dir, f"{int(page)}.png")
                if not os.path.exists(alt_unpadded):
                    try:
                        shutil.copyfile(out_file, alt_unpadded)  # 產出 7.png / 10.png 相容檔名
                    except Exception:
                        pass
                if not saved_flag:
                    yield sse({
                        "stage": "saved",
                        "page": page,
                        "url": f"/output/{pid}/images/{int(page):02d}.png"
                    })

            yield sse({"stage": "done", "page": page})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# --- PATCH: TTS 設定 ---
@app.get("/api/tts_settings/{pid}")
def api_get_tts_settings(pid: str):
    p = store.get_project(pid)
    default = {"voice": "alloy", "head_margin": 0.35, "tail_margin": 0.40}
    cfg = {**default, **(p.get("tts") or {})}
    return cfg


@app.put("/api/tts_settings/{pid}")
async def api_set_tts_settings(pid: str, req: Request):
    data = await req.json()
    cfg = {"voice": data.get("voice", "alloy"),
           "head_margin": float(data.get("head_margin", 0.35)),
           "tail_margin": float(data.get("tail_margin", 0.40))}
    p = store.get_project(pid);
    p["tts"] = cfg;
    store.put_project(pid, p)
    return {"ok": True, "tts": cfg}


# ---- 旁白 TTS ----
@app.get("/api/gen/tts/{pid}/{page}")
def api_gen_tts(pid: str, page: int):
    p = store.get_project(pid)
    spread = [s for s in p['storyboard']['spreads'] if s['page'] == page][0]
    raw_text = spread.get('display_text') or spread.get('summary') or ''
    text = clean_tts_text(raw_text, page)
    tts_cfg = p.get("tts") or {};
    voice = tts_cfg.get("voice", "alloy")

    out_dir = os.path.join(OUTPUT_DIR, pid, "tts")

    def event_stream():
        yield sse({"stage": "start", "page": page})
        for msg in tts_stream(page, text, voice, out_dir):
            yield "data: " + msg + "\n\n"
        yield sse({"stage": "done", "page": page})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---- 匯出 ----
@app.get("/api/export/pdf/{pid}")
def api_export_pdf(pid: str):
    p = store.get_project(pid)
    spreads = p['storyboard']['spreads']
    for sp in spreads:
        img_path = os.path.join(OUTPUT_DIR, pid, "images", f"{int(sp['page']):02d}.png")
        sp['image_path'] = img_path if os.path.exists(img_path) else None
    out_path = os.path.join(OUTPUT_DIR, pid, "export", "book.pdf")
    ensure_dir(os.path.dirname(out_path))
    export_pdf(spreads, p['outlines'][0]['title'], "You", out_path)
    return FileResponse(out_path, media_type="application/pdf", filename="storybook.pdf")


@app.get("/api/export/epub/{pid}")
def api_export_epub(pid: str):
    p = store.get_project(pid)
    spreads = p['storyboard']['spreads']
    for sp in spreads:
        img_path = os.path.join(OUTPUT_DIR, pid, "images", f"{int(sp['page']):02d}.png")
        sp['image_path'] = img_path if os.path.exists(img_path) else None
    out_path = os.path.join(OUTPUT_DIR, pid, "export", "book.epub")
    ensure_dir(os.path.dirname(out_path))
    export_epub(spreads, p['outlines'][0]['title'], "You", out_path)
    return FileResponse(out_path, media_type="application/epub+zip", filename="storybook.epub")


@app.get("/api/export/mp4/{pid}")
def api_export_mp4(pid: str):
    p = store.get_project(pid)
    spreads = p['storyboard']['spreads']
    pairs = []
    for sp in spreads:
        img_path = os.path.join(OUTPUT_DIR, pid, "images", f"{int(sp['page']):02d}.png")
        audio_path = os.path.join(OUTPUT_DIR, pid, "tts", f"{int(sp['page']):02d}.mp3")
        pairs.append({"image": img_path if os.path.exists(img_path) else None,
                      "audio": audio_path if os.path.exists(audio_path) else None,
                      "duration": 4.0,
                      "subtitle": sp['display_text'],
                      "sfx": sp.get("sfx_tags", [])})
    out_path = os.path.join(OUTPUT_DIR, pid, "export", "movie.mp4")
    ensure_dir(os.path.dirname(out_path))

    tts_cfg = p.get("tts") or {}
    head = float(tts_cfg.get("head_margin", 0.35));
    tail = float(tts_cfg.get("tail_margin", 0.40))
    pairs = [pp for pp in pairs if pp['image']]
    build_video(pairs, out_path, fps=24, head_margin=head, tail_margin=tail)
    return FileResponse(out_path, media_type="video/mp4", filename="storybook.mp4")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info", loop="asyncio", http="h11")
