import os
def gpu_available():
    try:
        import torch
        if torch.cuda.is_available(): return True
        if hasattr(torch.backends,'mps') and torch.backends.mps.is_available(): return True
    except Exception: pass
    return False
def should_consider_cloud(seconds: float):
    if gpu_available(): return (False, "偵測到 GPU/MPS，可用本地加速。")
    if seconds >= 15*60:
        if os.getenv("OPENAI_API_KEY"): return (True, "CPU + 長音檔，建議雲端。")
        else: return (False, "建議雲端但未設定 OPENAI_API_KEY。")
    return (False, "時長不長，維持本地。")
