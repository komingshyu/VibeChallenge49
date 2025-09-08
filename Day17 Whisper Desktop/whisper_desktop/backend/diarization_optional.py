import os

class DiarizationAuthError(RuntimeError):
    pass

def _get_hf_token(strict=True):
    token = os.getenv("HF_TOKEN")
    if token: return token
    legacy = os.getenv("HUGGINGFACE_TOKEN") or os.getenv("HUGGING_FACE_TOKEN")
    if legacy and not strict:
        return legacy
    raise DiarizationAuthError("找不到 HF_TOKEN。請至 https://hf.co/settings/tokens 建立 Access Token，並設定到系統環境變數 HF_TOKEN。")

def _load_pipeline():
    try:
        from pyannote.audio import Pipeline
    except Exception:
        raise RuntimeError("尚未安裝 pyannote.audio（請於設定頁安裝選配或在功能切換時允許安裝）。")
    token = _get_hf_token(strict=False)
    try:
        for repo in ["pyannote/speaker-diarization-3.1","pyannote/speaker-diarization"]:
            try:
                return Pipeline.from_pretrained(repo, use_auth_token=token)
            except Exception as e:
                last = e
        msg = ("無法載入 pyannote 說話人分離模型。這可能是因為私有/受管控（gated）。\n"
               "請先：1) 於 https://hf.co/pyannote/speaker-diarization 接受使用條款；"
               "2) 於 https://hf.co/settings/tokens 建立 Token；3) 將 Token 設為 HF_TOKEN。")
        raise DiarizationAuthError(msg)
    except DiarizationAuthError:
        raise
    except Exception as e:
        raise RuntimeError(f"載入 pyannote pipeline 失敗：{e}")

def diarize_file(wav_path: str):
    pipe=_load_pipeline()
    try:
        d=pipe(wav_path); segs=[]; mapping={}; n=1
        for turn,_,spk in d.itertracks(yield_label=True):
            lab=str(spk)
            if lab not in mapping: mapping[lab]=f"SPK{n}"; n+=1
            segs.append((float(turn.start), float(turn.end), mapping[lab]))
        segs.sort(key=lambda x:(x[0],x[1])); return segs
    except Exception as e:
        raise RuntimeError(f"說話人分離失敗：{e}")

def assign_speaker_for_segment(seg_start, seg_end, diar):
    if not diar: return None
    def overlap(a,b,c,d): s=max(a,c); e=min(b,d); return max(0.0, e-s)
    best=None; bt=0.0
    for ds,de,spk in diar:
        t=overlap(seg_start, seg_end, ds, de)
        if t>bt: bt=t; best=spk
    return best
