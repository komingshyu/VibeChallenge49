
from typing import List, Dict, Any
from ..models.schemas import Outline, Storyboard, SpreadPlan
import re

def outline_to_spreads(outline: Outline, total_spreads: int = 14) -> Storyboard:
    beats = outline.beats
    if len(beats) < total_spreads:
        beats = beats + ["補充世界觀或逗趣過場。"] * (total_spreads - len(beats))
    beats = beats[:total_spreads]

    cast_names = [c.name for c in outline.cast]
    spreads = []
    for i, beat in enumerate(beats, start=1):
        display = beat
        image_prompt = f"童書風格、明亮、可愛、鏡頭居中、分鏡 {i}/{total_spreads}：{beat}"
        spreads.append(SpreadPlan(
            page=i, summary=beat, cast_names=cast_names[:3], display_text=display,
            image_prompt=image_prompt, sfx_tags=[],
            camera={"motion":"kenburns","zoom":"in" if i%2==0 else "out","pan":"left" if i%3==0 else "right"}
        ))
    return Storyboard(spreads=spreads)
