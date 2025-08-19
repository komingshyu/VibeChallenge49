# -*- coding: utf-8 -*-
"""
ASTRO//ARCANE — Mystical-Tech Astrology Web App (v3, Streaming)
Backend: FastAPI + Swiss Ephemeris (pyswisseph)
- 解讀使用 Streaming（SSE 風格；POST + chunked 回傳）
- 不向使用者索取 OpenAI Key，讀環境變數 OPENAI_API_KEY
- 回傳每個宮位的行星清單，前端顯示且解讀會引用
"""
import os
from datetime import datetime
from typing import Optional, List, Dict, Any, Iterator

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

import swisseph as swe  # pyswisseph
from geopy.geocoders import Nominatim
from timezonefinder import TimezoneFinder
import pytz

# Optional OpenAI support for interpretation (server-side env key only)
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except Exception:
    OPENAI_AVAILABLE = False

# --- Configuration ---
EPHE_PATH = os.environ.get("SE_EPHE_PATH", ".")
swe.set_ephe_path(EPHE_PATH)

# Web
app = FastAPI(title="ASTRO//ARCANE", version="3.0")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Geocoding + Timezone
geolocator = Nominatim(user_agent="astro_arcane_app")
tfinder = TimezoneFinder()

# ---- Utilities ----

ZODIAC = [
    {"name": "白羊座", "abbr": "Aries", "glyph": "♈", "element": "火"},
    {"name": "金牛座", "abbr": "Taurus", "glyph": "♉", "element": "土"},
    {"name": "雙子座", "abbr": "Gemini", "glyph": "♊", "element": "風"},
    {"name": "巨蟹座", "abbr": "Cancer", "glyph": "♋", "element": "水"},
    {"name": "獅子座", "abbr": "Leo", "glyph": "♌", "element": "火"},
    {"name": "處女座", "abbr": "Virgo", "glyph": "♍", "element": "土"},
    {"name": "天秤座", "abbr": "Libra", "glyph": "♎", "element": "風"},
    {"name": "天蠍座", "abbr": "Scorpio", "glyph": "♏", "element": "水"},
    {"name": "射手座", "abbr": "Sagittarius", "glyph": "♐", "element": "火"},
    {"name": "摩羯座", "abbr": "Capricorn", "glyph": "♑", "element": "土"},
    {"name": "水瓶座", "abbr": "Aquarius", "glyph": "♒", "element": "風"},
    {"name": "雙魚座", "abbr": "Pisces", "glyph": "♓", "element": "水"},
]

HOUSE_MEANINGS = {
    1: "自我、外在形象、開端、身體與氣場。",
    2: "價值、財務、個人資源與自我價值感。",
    3: "溝通、學習、鄰里、手足與短途旅行。",
    4: "家庭、根源、私生活與內在安全感。",
    5: "創造、戀愛、子女、表演與自我表達。",
    6: "日常、服務、健康、工作流程與照顧。",
    7: "伴侶、合作、對手與公開的關係。",
    8: "共享資源、親密、轉化、危機與再生。",
    9: "信念、遠行、高等教育、哲學與出版。",
    10: "事業、名聲、社會角色與目標。",
    11: "朋友、人脈、團體與未來願景。",
    12: "潛意識、療癒、隱居、結束與放下。",
}

PLANETS = [
    ("太陽", swe.SUN, "☉"),
    ("月亮", swe.MOON, "☽"),
    ("水星", swe.MERCURY, "☿"),
    ("金星", swe.VENUS, "♀"),
    ("火星", swe.MARS, "♂"),
    ("木星", swe.JUPITER, "♃"),
    ("土星", swe.SATURN, "♄"),
    ("天王星", swe.URANUS, "♅"),
    ("海王星", swe.NEPTUNE, "♆"),
    ("冥王星", swe.PLUTO, "♇"),
]

ANGULAR = {1, 4, 7, 10}
CADENT = {3, 6, 9, 12}
SUCCEDENT = {2, 5, 8, 11}

ASPECTS = [
    ("合相", 0, 8),
    ("六合", 60, 4),
    ("四分相", 90, 6),
    ("三分相", 120, 7),
    ("對分相", 180, 8),
]
MAJOR_ASPECTS = {"合相", "三分相", "對分相"}

def norm360(x: float) -> float:
    x = x % 360.0
    if x < 0:
        x += 360.0
    return x

def angle_distance(a: float, b: float) -> float:
    d = abs(norm360(a - b))
    return min(d, 360 - d)

def format_dms(deg: float) -> Dict[str, Any]:
    total = deg % 360.0
    sign_idx = int(total // 30)
    within = total % 30
    d = int(within)
    m_float = (within - d) * 60
    m = int(m_float)
    s = int(round((m_float - m) * 60))
    if s == 60:
        s = 0; m += 1
    if m == 60:
        m = 0; d += 1
    return {
        "sign_index": sign_idx,
        "sign_name": ZODIAC[sign_idx]["name"],
        "sign_glyph": ZODIAC[sign_idx]["glyph"],
        "deg": d,
        "min": m,
        "sec": s,
        "text": f'{ZODIAC[sign_idx]["glyph"]}{d:02d}°{m:02d}′{s:02d}″ {ZODIAC[sign_idx]["name"]}',
    }

def arc_contains(angle: float, start: float, end: float) -> bool:
    start = norm360(start); end = norm360(end); angle = norm360(angle)
    span = (end - start) % 360.0
    offset = (angle - start) % 360.0
    return 0 <= offset < span if span != 0 else False

def pick_house(lon: float, cusps: List[float]) -> int:
    cusp_list = list(cusps)
    if len(cusp_list) == 13:
        cusp_list = cusp_list[1:13]
    elif len(cusp_list) > 12:
        cusp_list = cusp_list[:12]
    for i in range(12):
        start = cusp_list[i]
        end = cusp_list[(i + 1) % 12]
        if arc_contains(lon, start, end):
            return i + 1
    return 12

def accidental_status(house: int, retrograde: bool, near_angle: bool) -> Dict[str, Any]:
    status = {"flags": [], "score": 0}
    if house in ANGULAR:
        status["flags"].append("Angular（意外尊貴）"); status["score"] += 1
    elif house in CADENT:
        status["flags"].append("Cadent（意外失勢）"); status["score"] -= 1
    else:
        status["flags"].append("Succedent（中性）")
    if retrograde:
        status["flags"].append("逆行（減分）"); status["score"] -= 1
    if near_angle:
        status["flags"].append("臨近角度（略加分）"); status["score"] += 0.5
    return status

def near(a: float, b: float, orb: float=5.0) -> bool:
    return angle_distance(a, b) <= orb

def orb_for(aspect_name: str, p1: str, p2: str) -> float:
    base = next(o for n, a, o in ASPECTS if n == aspect_name)
    if p1 in ("太陽", "月亮") or p2 in ("太陽", "月亮"):
        base += 2.0
    return base

def detect_aspects(positions: Dict[str, float]) -> List[Dict[str, Any]]:
    items = []
    names = list(positions.keys())
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            n1, n2 = names[i], names[j]
            a1, a2 = positions[n1], positions[n2]
            delta = angle_distance(a1, a2)
            for asp_name, asp_angle, _orb in ASPECTS:
                diff = abs(delta - asp_angle)
                if diff <= orb_for(asp_name, n1, n2):
                    importance = "major" if asp_name in MAJOR_ASPECTS else "minor"
                    strength = max(0.0, orb_for(asp_name, n1, n2) - diff)
                    items.append({
                        "pair": f"{n1}–{n2}",
                        "type": asp_name,
                        "exact": asp_angle,
                        "delta": round(delta, 2),
                        "off_exact": round(diff, 2),
                        "importance": importance,
                        "strength": round(strength, 2),
                    })
    items.sort(key=lambda x: (x["importance"] != "major", -x["strength"]))
    return items

def detect_grand_trines(positions: Dict[str, float]) -> List[Dict[str, Any]]:
    keys = list(positions.keys())
    out = []
    for i in range(len(keys)):
        for j in range(i+1, len(keys)):
            for k in range(j+1, len(keys)):
                a, b, c = positions[keys[i]], positions[keys[j]], positions[keys[k]]
                def is_trine(x, y): return abs(angle_distance(x, y) - 120) <= 6
                if is_trine(a, b) and is_trine(a, c) and is_trine(b, c):
                    def element_for(lon):
                        sign_idx = int((lon % 360) // 30)
                        return ZODIAC[sign_idx]["element"]
                    elems = [element_for(a), element_for(b), element_for(c)]
                    elem = elems[0] if len(set(elems)) == 1 else "混合"
                    out.append({"triplet": [keys[i], keys[j], keys[k]], "element": elem})
    return out

def calc_chart(dt_local: datetime, latitude: float, longitude: float) -> Dict[str, Any]:
    # 時區自動推斷並轉 UT
    tzname = tfinder.timezone_at(lng=longitude, lat=latitude)
    if tzname is None:
        raise HTTPException(status_code=400, detail="無法判斷時區，請手動提供較精確的出生地或經緯度。")
    tz = pytz.timezone(tzname)
    localized = tz.localize(dt_local)
    dt_ut = localized.astimezone(pytz.utc)
    ut_hour = dt_ut.hour + dt_ut.minute/60.0 + dt_ut.second/3600.0

    # UT Julian Day
    birth_julian_day = swe.julday(dt_ut.year, dt_ut.month, dt_ut.day, ut_hour, swe.GREG_CAL)

    # 宮位（Placidus）— 正確使用 swe.houses
    cusps, ascmc = swe.houses(birth_julian_day, latitude, longitude, b'P')

    positions: Dict[str, float] = {}
    details: Dict[str, Any] = {}
    aspects_basis: Dict[str, float] = {}

    # 上升點
    asc_lon = float(ascmc[0])
    positions["上升"] = asc_lon
    asc_fmt = format_dms(asc_lon)

    # 行星
    for cname, pid, glyph in PLANETS:
        # 正確使用 swe.calc_ut
        result, ret = swe.calc_ut(birth_julian_day, pid)
        lon, lat, dist = result[:3]
        speed_long = result[3]
        positions[cname] = lon
        aspects_basis[cname] = lon

        h = pick_house(lon, list(cusps))
        d = format_dms(lon)
        near_asc = near(lon, asc_lon, orb=5.0)
        retro = speed_long < 0

        details[cname] = {
            "name": cname,
            "glyph": glyph,
            "lon": lon,
            "lat": lat,
            "dist": dist,
            "sign": d,
            "house": h,
            "house_meaning": HOUSE_MEANINGS.get(h, ""),
            "accidental": accidental_status(h, retro, near_asc),
            "retrograde": retro,
        }

    # 上升當作偽天體列出（固定落 1 宮）
    details["上升"] = {
        "name": "上升",
        "glyph": "ASC",
        "lon": asc_lon,
        "lat": None,
        "dist": None,
        "sign": asc_fmt,
        "house": 1,
        "house_meaning": HOUSE_MEANINGS.get(1, ""),
        "accidental": {"flags": ["角度點"], "score": 1},
        "retrograde": False,
    }

    # 相位（不含上升）
    aspects = detect_aspects(aspects_basis)

    # 大三角
    grand_trines = detect_grand_trines(aspects_basis)

    # 宮首整理 & 落宮清單
    cusp_list = list(cusps)
    if len(cusp_list) == 13:
        cusp_list = cusp_list[1:13]
    elif len(cusp_list) > 12:
        cusp_list = cusp_list[:12]

    house_data = []
    occupants_map: Dict[int, List[str]] = {i: [] for i in range(1, 13)}
    for pname in [p[0] for p in PLANETS]:
        h = details[pname]["house"]
        occupants_map[h].append(pname)

    for i, cusp in enumerate(cusp_list, start=1):
        house_data.append({
            "house": i,
            "cusp": cusp,
            "cusp_text": format_dms(cusp)["text"],
            "meaning": HOUSE_MEANINGS.get(i, ""),
            "occupants": occupants_map[i],
        })

    return {
        "utc": dt_ut.isoformat(),
        "tz": tzname,
        "positions": positions,
        "details": details,
        "aspects": aspects,
        "grand_trines": grand_trines,
        "houses": house_data,
        "ascendant": {"lon": asc_lon, "sign": asc_fmt},
    }

# ---- Models ----

class ChartRequest(BaseModel):
    datetime_local: str = Field(..., description="本地時間（出生地當地時間）ISO 格式，如 1995-08-01T14:30")
    place: Optional[str] = Field(None, description="地名，用於地理編碼（可選）")
    latitude: Optional[float] = Field(None, description="緯度（可選）")
    longitude: Optional[float] = Field(None, description="經度（可選）")

class InterpretRequest(BaseModel):
    chart: Dict[str, Any]

# ---- Routes ----

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/chart")
async def api_chart(req: ChartRequest):
    if not req.datetime_local:
        raise HTTPException(status_code=400, detail="缺少出生時間（需精確到分鐘）。")

    lat, lon = req.latitude, req.longitude
    if (lat is None or lon is None):
        if not req.place:
            raise HTTPException(status_code=400, detail="請提供出生地（地名）或經緯度。")
        loc = geolocator.geocode(req.place, language="zh-TW")
        if loc is None:
            raise HTTPException(status_code=400, detail=f"無法找到地點：{req.place}，請改用經緯度或更精確的地名。")
        lat, lon = float(loc.latitude), float(loc.longitude)

    try:
        dt_local = datetime.fromisoformat(req.datetime_local)
    except Exception:
        raise HTTPException(status_code=400, detail="時間格式需為 ISO，如 2000-01-01T08:15")

    chart = calc_chart(dt_local, latitude=lat, longitude=lon)
    has_ai = bool(os.environ.get("OPENAI_API_KEY"))
    return JSONResponse({"ai_ready": has_ai, **chart})

@app.post("/api/interpret/stream")
async def api_interpret_stream(req: InterpretRequest):
    """Streaming interpret endpoint (SSE-like)."""
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    chart = req.chart

    def sse_yield(text_iter: Iterator[str]):
        # Helpful headers to reduce buffering in some reverse proxies
        yield "event: start\ndata: 解讀開始\n\n"
        for chunk in text_iter:
            # 每段 chunk 以 data: 行輸出，遵循 SSE 格式
            yield f"data: {chunk}\n\n"
        yield "event: done\ndata: [DONE]\n\n"

    # 沒有 openai 或 key → 流式輸出模板解讀
    if not (openai_key and OPENAI_AVAILABLE):
        def chunker(txt: str, n: int = 40) -> Iterator[str]:
            for i in range(0, len(txt), n):
                yield txt[i:i+n]
        txt = fallback_interpretation(chart)
        return StreamingResponse(
            sse_yield(chunker(txt, 40)),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        )

    # 有 openai → 以 Chat Completions 串流
    client = OpenAI(api_key=openai_key)

    # 落宮摘要
    house_occupancy_lines = []
    for h in chart["houses"]:
        if h["occupants"]:
            house_occupancy_lines.append(f'第{h["house"]}宮（{h["meaning"]}）：' + "、".join(h["occupants"]))
    occupancy_text = "；".join(house_occupancy_lines) if house_occupancy_lines else "（此盤無明顯群星集中）"

    sun = chart["details"]["太陽"]["sign"]["text"]
    moon = chart["details"]["月亮"]["sign"]["text"]
    asc  = chart["details"]["上升"]["sign"]["text"]
    aspects_summary = "; ".join([f'{a["pair"]} {a["type"]}（偏差 {a["off_exact"]}°）' for a in chart["aspects"][:12]])

    prompt = f"""
你是一位專業占星解讀者。請根據以下出生星盤重點，撰寫約 400–600 字的中文性格與傾向分析，風格務實、避免宿命論：
- 太陽：{sun}
- 月亮：{moon}
- 上升：{asc}
- 落宮重點：{occupancy_text}
- 主要相位（節選）：{aspects_summary}

接著說明「行星落入各宮」對生活領域可能帶來的影響（請以條列的方式簡述 4–7 點，對應上文的落宮）。
最後給出具體可行的建議 3–5 條，聚焦學習、工作、人際與情緒管理。
"""

    def openai_stream():
        try:
            stream = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "你是精通西洋占星的中文助理，提供務實且尊重自由意志的解讀。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                stream=True,
            )
            for chunk in stream:
                try:
                    delta = chunk.choices[0].delta
                    if hasattr(delta, "content") and delta.content:
                        yield delta.content
                except Exception:
                    # 兼容不同 SDK 物件結構
                    part = getattr(chunk, "choices", [{}])[0]
                    delta = getattr(part, "delta", {})
                    content = getattr(delta, "content", None) or ""
                    if content:
                        yield content
        except Exception as e:
            # 如果 OpenAI 串流出錯，切成模板內容繼續輸出，避免前端中斷
            txt = "（AI 串流中斷，改用模板簡述）\n" + fallback_interpretation(chart)
            for seg in (txt[i:i+50] for i in range(0, len(txt), 50)):
                yield seg

    return StreamingResponse(
        sse_yield(openai_stream()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

def fallback_interpretation(chart: Dict[str, Any]) -> str:
    sun = chart["details"]["太陽"]["sign"]["sign_name"]
    moon = chart["details"]["月亮"]["sign"]["sign_name"]
    asc  = chart["details"]["上升"]["sign"]["sign_name"]

    lines = []
    for h in chart["houses"]:
        if h["occupants"]:
            lines.append(f'第{h["house"]}宮：' + "、".join(h["occupants"]))
    occ = "；".join(lines) if lines else "無明顯群星集中。"

    parts = [
        f"你的核心動力（太陽）在{sun}，情緒習性（月亮）在{moon}，外在表現（上升）傾向{asc}。",
        f"落宮概覽：{occ}",
        "這種配置通常帶來明確的自我驅力與風格，但面對壓力時可能較為固著。",
        "建議以可量化的小目標累積動能，將靈感轉為日常節律。"
    ]
    return " ".join(parts)

# ---- Dev Runner ----
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8083)