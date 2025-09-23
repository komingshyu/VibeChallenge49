\
from pathlib import Path
from typing import List, Dict
import requests
from .utils import logger

ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
FONTS_DIR.mkdir(parents=True, exist_ok=True)

FONT_CATALOG = [
    {
        "name": "NotoSansTC-Regular.otf",
        "urls": [
            "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/TC/NotoSansTC-Regular.otf",
            "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf",
        ],
    },
    {
        "name": "LXGWWenKai-Regular.ttf",
        "urls": [
            "https://github.com/lxgw/LxgwWenKai/releases/latest/download/LXGWWenKai-Regular.ttf",
            "https://gitee.com/lxgw/LxgwWenKai/releases/download/latest/LXGWWenKai-Regular.ttf",
        ],
    },
    {
        "name": "ZCOOLKuaiLe-Regular.ttf",
        "urls": [
            "https://raw.githubusercontent.com/google/fonts/main/ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf",
        ],
    },
]

def list_fonts() -> List[str]:
    return [p.name for p in FONTS_DIR.glob("*.*") if p.suffix.lower() in (".ttf", ".otf")]

def _download_one(url: str, dest: Path) -> bool:
    try:
        headers = {"User-Agent": "elder-art-installer/1.0", "Accept": "*/*"}
        r = requests.get(url, headers=headers, timeout=60); r.raise_for_status()
        content = r.content
        if len(content) < 1024*50: raise ValueError("Downloaded file too small")
        dest.write_bytes(content); return True
    except Exception as e:
        logger.warning(f"下載失敗 {url} => {e}")
        return False

def download_default_fonts() -> Dict[str, str]:
    results: Dict[str, str] = {}
    for item in FONT_CATALOG:
        name = item["name"]; dest = FONTS_DIR / name
        if dest.exists(): results[name] = "already_exists"; continue
        ok=False
        for url in item["urls"]:
            if _download_one(url, dest): results[name] = f"downloaded: {url}"; ok=True; break
        if not ok: results[name] = "error: all sources failed"
    return results
