from __future__ import annotations
import os
import io
import base64
from typing import Optional

from fastapi import UploadFile


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


async def read_file_to_base64(file: UploadFile) -> str:
    data = await file.read()
    return base64.b64encode(data).decode("utf-8")


def save_bytes(path: str, data: bytes):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def infer_image_ext(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return ".jpg"
    if lower.endswith(".webp"):
        return ".webp"
    return ".png"
