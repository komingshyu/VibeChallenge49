
import os, re

def safe_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "—", name).strip()

def _svg_wrapper(inner: str, w: int = 340, h: int = 220, title: str = "") -> str:
    return f"""
<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="background:#fff;border:1px solid #eee;border-radius:8px;font-family: system-ui,-apple-system,Segoe UI,Noto Sans CJK TC,Microsoft JhengHei,PingFang TC,sans-serif;">
  <defs>
    <linearGradient id="grid" gradientTransform="rotate(90)">
      <stop offset="0%" stop-color="#f9f9f9" />
      <stop offset="100%" stop-color="#f2f2f2" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="{w}" height="{h}" fill="white"/>
  <rect x="10" y="36" width="{w-20}" height="{h-46}" fill="url(#grid)" stroke="#eee"/>
  <text x="12" y="24" font-size="16" font-weight="600">{title}</text>
  {inner}
</svg>
"""

def _candle(x, open_, high, low, close, color):
    body_top = max(open_, close)
    body_bot = min(open_, close)
    body_h = max(1, body_top - body_bot)
    return f"""
  <line x1='{x}' y1='{low}' x2='{x}' y2='{high}' stroke='{color}' stroke-width='2' />
  <rect x='{x-6}' y='{body_bot}' width='12' height='{body_h}' fill='{color}' stroke='{color}' />
"""

def hammer_svg():
    w, h = 340, 220
    x0, y0, W, H = 10, 36, w-20, h-46
    mid = y0 + H*0.6
    parts = []
    parts.append(_candle(x0+W*0.35, mid+15, mid+18, mid-30, mid+10, "#d32f2f"))
    parts.append(_candle(x0+W*0.55, mid+10, mid+12, mid-28, mid+9, "#d32f2f"))
    parts.append(_candle(x0+W*0.75, mid-5,  mid+2,  mid-45, mid-3, "#d32f2f"))
    text = "<text x='12' y='{y}' font-size='12' fill='#333'>{t}</text>".format(y=h-12, t="下影長、小實體：趨勢底部常見反轉訊號")
    return _svg_wrapper("\n".join(parts)+text, w,h, "錘子線（Hammer）")

def shooting_star_svg():
    w, h = 340, 220
    x0, y0, W, H = 10, 36, w-20, h-46
    mid = y0 + H*0.45
    parts = []
    parts.append(_candle(x0+W*0.35, mid-10, mid-5,  mid-25, mid-8, "#1b5e20"))
    parts.append(_candle(x0+W*0.55, mid-12, mid-7,  mid-30, mid-9, "#1b5e20"))
    parts.append(_candle(x0+W*0.75, mid-20, mid-60, mid-23, mid-19, "#1b5e20"))
    text = "<text x='12' y='{y}' font-size='12' fill='#333'>{t}</text>".format(y=h-12, t="上影長、小實體：趨勢頂部常見反轉訊號")
    return _svg_wrapper("\n".join(parts)+text, w,h, "墓碑線（Shooting Star）")

def ma_cross_svg():
    w, h = 340, 220
    x0, y0, W, H = 10, 36, w-20, h-46
    path_ma_short = f"M {x0} {y0+H*0.65} C {x0+W*0.3} {y0+H*0.55}, {x0+W*0.5} {y0+H*0.45}, {x0+W*0.9} {y0+H*0.35}"
    path_ma_long  = f"M {x0} {y0+H*0.50} C {x0+W*0.3} {y0+H*0.48}, {x0+W*0.6} {y0+H*0.52}, {x0+W*0.9} {y0+H*0.55}"
    inner = f"""
  <path d='{path_ma_short}' fill='none' stroke='#ef5350' stroke-width='2'/>
  <path d='{path_ma_long}'  fill='none' stroke='#90a4ae' stroke-width='2'/>
  <circle cx='{x0+W*0.62}' cy='{y0+H*0.49}' r='5' fill='#ef5350'/>
  <text x='{x0+10}' y='{y0+18}' font-size='12' fill='#555'>短期均線上穿長期均線 → 黃金／死亡交叉示意</text>
"""
    return _svg_wrapper(inner, w,h, "黃金／死亡交叉（MA Cross）")

def sr_band_svg():
    w, h = 340, 220
    x0, y0, W, H = 10, 36, w-20, h-46
    sup_y1 = y0 + H*0.65
    sup_y2 = y0 + H*0.75
    res_y1 = y0 + H*0.35
    res_y2 = y0 + H*0.45
    inner = f"""
  <rect x='{x0}' y='{sup_y1}' width='{W}' height='{sup_y2-sup_y1}' fill='#81c784' opacity='0.25'/>
  <rect x='{x0}' y='{res_y1}' width='{W}' height='{res_y2-sup_y1}' fill='#ffcc80' opacity='0.25'/>
  <text x='{x0+8}' y='{sup_y1-6}' font-size='12' fill='#2e7d32'>支撐帶</text>
  <text x='{x0+8}' y='{res_y1-6}' font-size='12' fill='#ef6c00'>阻力帶</text>
"""
    return _svg_wrapper(inner, w,h, "支撐與阻力帶")

def ensure_flashcard_svgs(out_dir: str) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    cards = {
        "hammer": ("錘子線（Hammer）", hammer_svg()),
        "shooting": ("墓碑線（Shooting Star）", shooting_star_svg()),
        "ma_cross": ("黃金—死亡交叉（MA Cross）", ma_cross_svg()),
        "sr_band": ("支撐與阻力帶", sr_band_svg()),
    }
    paths = {}
    for key, (title, svg) in cards.items():
        fn = os.path.join(out_dir, safe_filename(title) + ".svg")
        with open(fn, "w", encoding="utf-8") as f:
            f.write(svg)
        paths[key] = fn
    return paths
