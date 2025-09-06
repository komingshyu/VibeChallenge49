# app/utils/naming.py
from __future__ import annotations
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent / "output"

def project_dir(pid: str) -> Path:
    d = ROOT / pid
    d.mkdir(parents=True, exist_ok=True)
    return d

def images_dir(pid: str) -> Path:
    d = project_dir(pid) / "images"
    d.mkdir(parents=True, exist_ok=True)
    return d

def tts_dir(pid: str) -> Path:
    d = project_dir(pid) / "tts"
    d.mkdir(parents=True, exist_ok=True)
    return d

def characters_dir(pid: str) -> Path:
    d = project_dir(pid) / "characters"
    d.mkdir(parents=True, exist_ok=True)
    return d

def page_image_path(pid: str, page: int) -> Path:
    return images_dir(pid) / f"{page:02d}.png"

def page_tts_path(pid: str, page: int) -> Path:
    return tts_dir(pid) / f"{page:02d}.mp3"

def character_image_path(pid: str, cid: str) -> Path:
    return characters_dir(pid) / f"{cid}.png"

def public_image_url(pid: str, page: int, v: Optional[int] = None) -> str:
    url = f"/output/{pid}/images/{page:02d}.png"
    return f"{url}?v={int(v)}" if v is not None else url

def public_tts_url(pid: str, page: int, v: Optional[int] = None) -> str:
    url = f"/output/{pid}/tts/{page:02d}.mp3"
    return f"{url}?v={int(v)}" if v is not None else url
