# app/generators/images_atomic.py
from __future__ import annotations
import os, io
from pathlib import Path
from typing import Callable
from PIL import Image

def save_image_atomic(img: Image.Image, final_path: Path) -> None:
    final_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = final_path.with_suffix(final_path.suffix + ".tmp")
    with io.BytesIO() as mem:
        img.save(mem, format="PNG")
        data = mem.getvalue()
    with open(tmp_path, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, final_path)  # 原子交換
