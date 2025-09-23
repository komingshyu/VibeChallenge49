from pathlib import Path
import base64
from typing import Dict

def image_as_data_url(image_path: str) -> str:
    p = Path(image_path)
    mime = "image/png" if p.suffix.lower()==".png" else "image/jpeg"
    b = p.read_bytes(); b64 = base64.b64encode(b).decode("ascii")
    return f"data:{mime};base64,{b64}"

def make_share_payload(image_path: str) -> Dict[str,str]:
    data_url = image_as_data_url(image_path)
    return {
        "data_url": data_url,
        "fb_share_url": "https://www.facebook.com/sharer/sharer.php?u=",
        "line_share_url": "https://social-plugins.line.me/lineit/share?url=",
    }
