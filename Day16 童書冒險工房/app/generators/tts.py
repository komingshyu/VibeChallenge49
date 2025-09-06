
import os, json
from typing import Iterable
from ..openai_client import tts_to_file

def tts_stream(page: int, text: str, voice: str, out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{page:02d}.mp3")
    yield json.dumps({"page": page, "stage": "queue"})
    tts_to_file(text, voice, out_path)
    yield json.dumps({"page": page, "stage": "saved", "path": out_path})
