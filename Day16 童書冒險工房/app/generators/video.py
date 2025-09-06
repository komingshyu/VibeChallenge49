# app/generators/video.py
import os
from typing import List, Dict, Any
from moviepy.editor import (
    ImageClip, AudioFileClip, concatenate_videoclips, vfx
)

def _safe_audio_duration(path: str) -> float:
    try:
        with AudioFileClip(path) as a:
            return float(a.duration or 0.0)
    except Exception:
        # 最保險的 fallback（無法讀就當 0）
        return 0.0

def _ken_burns(image_path: str, dur: float, zoom: float = 1.08):
    """
    輕微 Ken‑Burns。以時間線性放大，避免眩暈。
    """
    base = ImageClip(image_path)  # 已是 16:9；外部已確保尺寸
    base = base.set_duration(dur)
    def scaler(t):  # 0 -> dur 時，從 1.0 放到 zoom
        if dur <= 0: return 1.0
        return 1.0 + (zoom - 1.0) * (t / dur)
    return base.resize(scaler)

def build_video(pairs: List[Dict[str, Any]], out_path: str,
                fps: int = 24, head_margin: float = 0.35, tail_margin: float = 0.40):
    """
    pairs: [{image, audio, duration(預設 4.0), subtitle(可忽略), sfx(可忽略)}...]
    - 會「量測每段 audio 的實長」，並把 clip.duration 設為 max(預設秒數, 音長 + head + tail)。
    - audio 會 set_start(head_margin) 並加極短 fadein/out，避免爆音。
    - 逐段 concatenate，**不會**互相重疊。
    """
    clips = []
    for i, p in enumerate(pairs):
        img = p.get("image")
        if not img or not os.path.exists(img):
            continue

        # 讀音長；沒音檔就 0
        audio_path = p.get("audio")
        adur = _safe_audio_duration(audio_path) if audio_path and os.path.exists(audio_path) else 0.0

        base_dur = float(p.get("duration") or 4.0)
        dur = max(base_dur, adur + head_margin + tail_margin)

        v = _ken_burns(img, dur, zoom=1.08)

        if adur > 0 and audio_path:
            a = AudioFileClip(audio_path).audio_fadein(0.15).audio_fadeout(0.20)
            v = v.set_audio(a.set_start(head_margin))

        clips.append(v)

    if not clips:
        raise RuntimeError("No valid clips to compose.")

    final = concatenate_videoclips(clips, method="compose")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    final.write_videofile(
        out_path, fps=fps,
        codec="libx264", audio_codec="aac",
        temp_audiofile=out_path + ".temp.m4a",
        remove_temp=True
    )
    final.close()
    # 釋放資源（在某些平台不關閉會鎖檔）
    for c in clips:
        try: c.close()
        except Exception: pass
