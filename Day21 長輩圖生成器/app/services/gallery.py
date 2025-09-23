from pathlib import Path
from typing import List, Dict

ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets"
GALLERY_DIR = ASSETS_DIR / "gallery"
GALLERY_DIR.mkdir(parents=True, exist_ok=True)

def list_gallery() -> List[Dict]:
    items = []
    for p in GALLERY_DIR.glob("*.*"):
        if p.is_file():
            items.append({"name": p.name, "path": str(p.resolve()), "mtime": p.stat().st_mtime})
    items.sort(key=lambda x: x["mtime"], reverse=True)
    return items

def delete_image(name: str) -> bool:
    p = GALLERY_DIR / name
    if p.exists() and p.is_file():
        p.unlink(); return True
    return False
