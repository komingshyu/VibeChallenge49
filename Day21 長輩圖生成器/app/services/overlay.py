\
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageColor
from typing import List, Dict
from pathlib import Path
from .utils import logger

ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
GALLERY_DIR = ASSETS_DIR / "gallery"
GALLERY_DIR.mkdir(parents=True, exist_ok=True)

def _get_font(font_name: str, size: int) -> ImageFont.FreeTypeFont:
    font_path = (FONTS_DIR / font_name)
    if not font_path.exists():
        logger.warning(f"字體 {font_name} 不存在，改用預設字體。")
        return ImageFont.load_default()
    return ImageFont.truetype(str(font_path), size=size, encoding="unic")

def _parse_color(c: str, fallback=(255,255,255,255)):
    if not c: return fallback
    c = c.strip()
    try:
        if c.startswith('#'):
            c = c[1:]
            if len(c)==6:
                r=int(c[0:2],16); g=int(c[2:4],16); b=int(c[4:6],16); a=255
                return (r,g,b,a)
            if len(c)==8:
                r=int(c[0:2],16); g=int(c[2:4],16); b=int(c[4:6],16); a=int(c[6:8],16)
                return (r,g,b,a)
        return ImageColor.getcolor('#'+c if len(c) in (6,8) else c, "RGBA")
    except Exception:
        return fallback

def render_overlay(base_image_path: str, texts: List[Dict], out_name: str = "", image_quality: int = 95) -> str:
    base = Image.open(base_image_path).convert("RGBA")
    shadow_canvas = Image.new("RGBA", base.size, (0, 0, 0, 0))
    text_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))

    for item in texts:
        txt = item.get("text", "")
        if not txt: continue
        x, y = int(item.get("x", 0)), int(item.get("y", 0))
        size = int(item.get("size", 72))
        color = _parse_color(item.get("color", "#ffffff"))
        font_name = item.get("font", "NotoSansTC-Regular.otf")
        align = item.get("align", "left")
        stroke_width = int(item.get("stroke_width", 0))
        stroke_fill = _parse_color(item.get("stroke_fill", "#000000"))
        shadow = item.get("shadow", None)

        # 陰影強度：dx=dy=strength, blur=2*strength
        if shadow and shadow.get("strength"):
            try: strong = int(shadow.get("strength", 0))
            except: strong = 0
            if strong>0:
                shadow.setdefault("dx", strong); shadow.setdefault("dy", strong)
                shadow.setdefault("blur", max(0, strong*2))
                shadow.setdefault("color", shadow.get("color", "#00000088"))

        font = _get_font(font_name, size)

        if shadow:
            dx = int(shadow.get("dx", 2)); dy = int(shadow.get("dy", 2))
            blur = int(shadow.get("blur", 0))
            scolor = _parse_color(shadow.get("color", "#00000088"))
            sh = Image.new("RGBA", base.size, (0,0,0,0)); sdraw = ImageDraw.Draw(sh)
            sdraw.text((x+dx, y+dy), txt, font=font, fill=tuple(scolor),
                       stroke_width=stroke_width, stroke_fill=tuple(scolor), align=align)
            if blur>0: sh = sh.filter(ImageFilter.GaussianBlur(radius=blur))
            shadow_canvas = Image.alpha_composite(shadow_canvas, sh)

        tdraw = ImageDraw.Draw(text_layer)
        tdraw.text((x, y), txt, font=font, fill=tuple(color),
                   stroke_width=stroke_width, stroke_fill=tuple(stroke_fill), align=align)

    composed = Image.alpha_composite(Image.alpha_composite(base, shadow_canvas), text_layer).convert("RGB")
    out = Path(base_image_path)
    if not out_name: out_name = out.stem + "_overlay"
    out_file = (GALLERY_DIR / f"{out_name}.jpg").resolve()
    composed.save(out_file, format="JPEG", quality=image_quality)
    return str(out_file)
