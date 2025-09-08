import os, shutil, time, subprocess, glob
from typing import Tuple, List
from . import audio_utils
from .srt_writer import to_srt, to_vtt

def _safe(name: str) -> str:
    bad='\\/:*?"<>|'
    for ch in bad: name=name.replace(ch,'_')
    return name

def create_project(input_path: str|None, base_dir: str='./outputs') -> Tuple[str, str]:
    stem = os.path.splitext(os.path.basename(input_path))[0] if input_path else "live"
    ts = time.strftime("%Y%m%d-%H%M%S")
    pid = _safe(f"{stem}-{ts}")
    out_dir = os.path.join(base_dir, pid)
    os.makedirs(out_dir, exist_ok=True)
    # copy original file if any
    try:
        if input_path and os.path.exists(input_path):
            ext = os.path.splitext(input_path)[1].lower()
            dst = os.path.join(out_dir, f"original{ext}")
            if os.path.abspath(input_path) != os.path.abspath(dst):
                shutil.copy2(input_path, dst)
    except Exception:
        pass
    return pid, out_dir

def list_assets(project_dir: str) -> List[str]:
    return sorted(glob.glob(os.path.join(project_dir, "*")))

def save_wav(path: str, audio, sr: int):
    audio_utils.write_audio(path, audio, sr)

def write_subs(out_dir: str, segments, use_polished: bool):
    srt_path=os.path.join(out_dir,'subtitles.srt'); vtt_path=os.path.join(out_dir,'subtitles.vtt')
    srt_text=to_srt(segments, use_polished=use_polished); vtt_text=to_vtt(segments, use_polished=use_polished)
    with open(srt_path,'w',encoding='utf-8') as f: f.write(srt_text)
    with open(vtt_path,'w',encoding='utf-8') as f: f.write(vtt_text)
    return srt_path, vtt_path

def maybe_burn_subs(video_path: str, srt_path: str, out_path: str) -> bool:
    try:
        cmd=["ffmpeg","-y","-i",video_path,"-vf",f"subtitles={srt_path}","-c:a","copy","-preset","veryfast",out_path]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return True
    except Exception:
        return False
