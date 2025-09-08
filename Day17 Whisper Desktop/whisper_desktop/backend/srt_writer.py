from typing import List
import srt, datetime, webvtt
from .transcriber import Segment
def to_srt(segments: List[Segment], use_polished: bool=False) -> str:
    items=[]
    for i,s in enumerate(segments, start=1):
        start=datetime.timedelta(seconds=float(s.start)); end=datetime.timedelta(seconds=float(s.end))
        text=s.polished if (use_polished and getattr(s,'polished',None)) else s.text
        if getattr(s,'speaker',None): text=f"{s.speaker}: {text}"
        items.append(srt.Subtitle(index=i, start=start, end=end, content=text))
    return srt.compose(items)
def to_vtt(segments: List[Segment], use_polished: bool=False) -> str:
    srt_text=to_srt(segments, use_polished=use_polished); vtt=webvtt.from_srt(srt_text); return vtt.content
