from typing import List, Tuple
import numpy as np

def _energy_based_segments(audio: np.ndarray, sr: int, frame_ms=30, hop_ms=15, thr=0.01, min_speech=0.25):
    frame=int(sr*frame_ms/1000); hop=int(sr*hop_ms/1000); xs=[]
    for i in range(0,len(audio)-frame,hop):
        xs.append(float(np.sqrt((audio[i:i+frame]**2).mean()+1e-9)))
    xs=np.array(xs); thr = max(thr, 0.005)
    voiced=xs>thr; segs=[]; i=0; t=np.arange(len(xs))*hop/float(sr)
    while i<len(voiced):
        if voiced[i]:
            j=i
            while j<len(voiced) and voiced[j]: j+=1
            s=t[i]; e=t[min(j,len(t)-1)]+frame/float(sr)
            if e-s>=min_speech: segs.append((s,e))
            i=j
        else: i+=1
    return merge_close_segments(segs, gap=0.2)

def load_silero_vad():
    try:
        import torch
        model, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad', model='silero_vad', force_reload=False, onnx=False)
        (get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = utils
        return model, get_speech_timestamps, VADIterator, collect_chunks
    except Exception:
        return None, None, None, None

def detect_segments(audio: np.ndarray, sr: int, threshold: float=0.3, min_speech: float=0.25, max_silence: float=2.2):
    model, get_speech_timestamps, VADIterator, _ = load_silero_vad()
    if model is None or get_speech_timestamps is None:
        return _energy_based_segments(audio, sr, thr=threshold*0.02, min_speech=min_speech)
    import torch, inspect
    wav=torch.tensor(audio, dtype=torch.float32)
    if wav.ndim==1: wav=wav.unsqueeze(0)
    kwargs={'threshold': float(threshold)}
    try:
        sig = inspect.signature(get_speech_timestamps); params = sig.parameters
        if 'sampling_rate' in params: kwargs['sampling_rate']=sr
        if 'min_speech_duration_ms' in params: kwargs['min_speech_duration_ms']=int(min_speech*1000)
        elif 'min_speech_duration' in params: kwargs['min_speech_duration']=float(min_speech)
        if 'min_silence_duration_ms' in params: kwargs['min_silence_duration_ms']=int(max_silence*1000)
        elif 'max_silence_duration' in params: kwargs['max_silence_duration']=float(max_silence)
        if 'speech_pad_ms' in params: kwargs['speech_pad_ms']=0
    except Exception: pass
    try:
        ts = get_speech_timestamps(wav, model, **kwargs)
    except TypeError:
        try: ts = get_speech_timestamps(wav, model, sampling_rate=sr, threshold=float(threshold))
        except Exception: return _energy_based_segments(audio, sr, thr=threshold*0.02, min_speech=min_speech)
    except Exception:
        return _energy_based_segments(audio, sr, thr=threshold*0.02, min_speech=min_speech)
    segs=[(t['start']/sr, t['end']/sr) for t in ts if isinstance(t, dict) and 'start' in t and 'end' in t]
    # 限制最大段長，利於增量展示
    segs2=[]
    for s,e in segs:
        cur=s
        while cur<e:
            n=min(e, cur+20.0)
            segs2.append((cur,n)); cur=n
    return merge_close_segments(segs2, gap=0.15)

def merge_close_segments(segs, gap: float=0.2):
    if not segs: return []
    segs=sorted(segs, key=lambda x:x[0]); merged=[segs[0]]
    for s,e in segs[1:]:
        ps,pe=merged[-1]
        if s-pe<=gap: merged[-1]=(ps,max(pe,e))
        else: merged.append((s,e))
    return merged
