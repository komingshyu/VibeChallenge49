from dataclasses import dataclass
from typing import Optional, Iterable
import numpy as np
from faster_whisper import WhisperModel

LANG_MAP={"繁體中文":"zh","簡體中文":"zh","English":"en"}

@dataclass
class Segment:
    start: float; end: float; text: str
    speaker: str|None=None; polished: str|None=None

class Transcriber:
    def __init__(self, model: WhisperModel): self.model=model

    def iter_transcribe(self, audio: np.ndarray, sr: int, language: Optional[str], initial_prompt: Optional[str]) -> Iterable[Segment]:
        lang = LANG_MAP.get(language, language)
        segments, info = self.model.transcribe(audio, language=lang, beam_size=1, initial_prompt=initial_prompt)
        for seg in segments:
            yield Segment(start=float(seg.start), end=float(seg.end), text=str(seg.text))
