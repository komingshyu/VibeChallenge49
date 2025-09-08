import os, subprocess, tempfile, soundfile as sf, numpy as np, imageio_ffmpeg, librosa

def ensure_ffmpeg(): return imageio_ffmpeg.get_ffmpeg_exe()

def extract_audio(input_path: str, target_sr: int=16000, mono: bool=True) -> str:
    ffmpeg = ensure_ffmpeg(); out = os.path.join(tempfile.gettempdir(), "whisper_desktop_in.wav")
    args = [ffmpeg,"-y","-i",input_path,"-ac","1" if mono else "2","-ar",str(target_sr),"-vn","-f","wav",out]
    try: subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e: raise RuntimeError(f"FFmpeg 轉檔失敗：{e}")
    return out

def read_audio(path: str):
    y, sr = sf.read(path, always_2d=False)
    if hasattr(y, "ndim") and y.ndim == 2: y = y.mean(axis=1)
    return y.astype(np.float32), sr

def write_audio(path: str, data, sr: int):
    sf.write(path, data, sr)

def resample_audio(data, from_sr: int, to_sr: int=16000):
    if from_sr == to_sr: return data, from_sr
    y = librosa.resample(data, orig_sr=from_sr, target_sr=to_sr, res_type="kaiser_fast")
    return y.astype(np.float32), to_sr

def duration_of(path: str) -> float:
    with sf.SoundFile(path) as f: return len(f)/float(f.samplerate)
