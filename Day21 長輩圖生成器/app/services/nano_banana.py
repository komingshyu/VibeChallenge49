
import mimetypes, imghdr, os
from pathlib import Path
from typing import Generator, List, Dict, Optional
from google import genai
from google.genai import types
from .utils import logger

ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets"
GALLERY_DIR = ASSETS_DIR / "gallery"
GALLERY_DIR.mkdir(parents=True, exist_ok=True)

def _elder_style_hint() -> str:
    return ("Taiwanese elder-meme aesthetic: A rejection of modern aesthetics, marked by an old-school charm, unfiltered directness, and an infectious sense of positivity")

def _no_text_guardrail_hint() -> str:
    return ("Render an aesthetically pleasing image with NO visible text, NO letters, NO words, "
            "NO watermarks, and NO typographic elements. Typography-free.")

def _safe_filename(stem: str, ext: str) -> Path:
    stem = "".join(c if c.isalnum() or c in "-_." else "_" for c in stem)[:64]
    return (GALLERY_DIR / f"{stem}{ext}").resolve()

def _build_contents_from_text(prompt: str):
    txt = f"{prompt}\n\n{_elder_style_hint()}\n\n{_no_text_guardrail_hint()}"
    return [types.Content(role="user", parts=[types.Part.from_text(text=txt)])]

def _guess_mime(buf: bytes) -> str:
    k = imghdr.what(None, buf)
    return {"png":"image/png","jpeg":"image/jpeg","gif":"image/gif","jpg":"image/jpeg"}.get(k or "", "image/png")

def _system_instruction_i2i() -> str:
    return (
        "You are an image editor for family portraits in a Taiwanese elder‑meme aesthetic. "
        "STRICT REQUIREMENT: Preserve the identities and facial features of the people in the input reference photos. "
        "Do NOT invent new faces. Keep the same people count, age cues, skin tone, and relative facial proportions. "
        "Clothing, accessories, hairstyle, and full scene may change to match the theme. "
        "If only one reference is given, treat it as the grandparent(s). If two, the FIRST is grandparent(s), the SECOND is grandchild(ren). "
        "Place the family together in one coherent frame unless the prompt explicitly asks otherwise. "
        "Never render any visible text or letters in the image. Typography must be absent."
    )

def _build_contents_from_images(prompt: str, images: List[bytes], mimes: List[str], labels: List[str] = None):
    # Build multiple Content items so each reference can be annotated.
    labels = labels or ["GRANDPARENT", "GRANDCHILD"]
    contents = []
    for idx, (b, mt) in enumerate(zip(images, mimes)):
        tag = labels[idx] if idx < len(labels) else f"PHOTO_{idx+1}"
        mt = mt or _guess_mime(b)
        parts = [
            types.Part.from_text(text=(
                f"PHOTO_{idx+1} = {tag}. "
                f"This is the {tag.lower()} face reference. Keep identity and facial structure unchanged."
            )),
            types.Part.from_bytes(mime_type=mt, data=b),
        ]
        contents.append(types.Content(role="user", parts=parts))
    # Final task instruction with theme + elder style + guardrail
    final_text = (
        f"THEME: {prompt}\n\n"
        f"{_elder_style_hint()}\n\n"
        f"{_no_text_guardrail_hint()}\n\n"
        "Keep facial identities from the provided references, but restyle clothing and background to fit the theme. "
        "Compose a joyful, flattering family scene."
    )
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=final_text)]))
    return contents

class NanoBananaImageGen:
    def __init__(self, model: str = "gemini-2.5-flash-image-preview"):
        key = os.environ.get("GEMINI_API_KEY")
        if not key: raise RuntimeError("環境變數 GEMINI_API_KEY 未設定。")
        self.client = genai.Client(api_key=key)
        self.model = model

    def _save_inline(self, part) -> str:
        inline = part.inline_data
        buf = inline.data
        ext = mimetypes.guess_extension(inline.mime_type) or ".png"
        idx = len(list(GALLERY_DIR.glob("nb_*.*")))
        path = _safe_filename(f"nb_{idx}", ext)
        with open(path, "wb") as f: f.write(buf)
        return str(path)

    def _stream(self, contents, system_text: Optional[str] = None) -> Generator[Dict, None, None]:
        cfg = types.GenerateContentConfig(
            response_modalities=["IMAGE","TEXT"],
            system_instruction=types.Content(role="user", parts=[types.Part.from_text(text=system_text)]) if system_text else None
        )
        saved = []
        for ch in self.client.models.generate_content_stream(model=self.model, contents=contents, config=cfg):
            try:
                if not ch.candidates or not ch.candidates[0].content or not ch.candidates[0].content.parts: continue
                for p in ch.candidates[0].content.parts:
                    if getattr(p, "inline_data", None) and p.inline_data and p.inline_data.data:
                        path = self._save_inline(p); saved.append(path)
                        yield {"event":"image_chunk_saved","path":path}
                    else:
                        if getattr(ch, "text", ""): yield {"event":"status","text":ch.text}
            except Exception as e:
                logger.exception(e); yield {"event":"error","message":str(e)}
        yield {"event":"completed","images":saved}

    def stream_generate_from_text(self, prompt: str):
        return self._stream(_build_contents_from_text(prompt))

    def stream_generate_from_images(self, prompt: str, images: List[bytes], mimes: List[str]):
        return self._stream(_build_contents_from_images(prompt, images, mimes), system_text=_system_instruction_i2i())
