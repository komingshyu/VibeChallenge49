import os, threading
from typing import Callable, Optional
from huggingface_hub import snapshot_download, HfApi
from faster_whisper import WhisperModel

class ModelManager:
    def __init__(self, cache_dir: str="./.whisper_models"):
        self.cache_dir = cache_dir
        os.makedirs(self.cache_dir, exist_ok=True)

    def _repo_for_size(self, size: str) -> str:
        mapping = {
            "tiny": "Systran/faster-whisper-tiny",
            "base": "Systran/faster-whisper-base",
            "small": "Systran/faster-whisper-small",
            "medium": "Systran/faster-whisper-medium",
            "large-v2": "Systran/faster-whisper-large-v2",
            "large-v3": "Systran/faster-whisper-large-v3",
            "large": "Systran/faster-whisper-large-v3",
        }
        return mapping.get(size.strip(), "Systran/faster-whisper-large-v3")

    def ensure_download(self, size: str, progress_cb: Optional[Callable[[int,int],None]] = None):
        repo_id = self._repo_for_size(size)
        api = HfApi(); info = api.repo_info(repo_id, repo_type='model')
        total = int(sum([s.size or 0 for s in info.siblings])) or 1

        stop=False
        def poll():
            import time
            subdir = os.path.join(self.cache_dir, repo_id.split("/")[-1])
            while not stop:
                size_now = 0
                root_to_walk = subdir if os.path.exists(subdir) else self.cache_dir
                for root,_,files in os.walk(root_to_walk):
                    for f in files:
                        p=os.path.join(root,f)
                        try: size_now += os.path.getsize(p)
                        except FileNotFoundError: pass
                if progress_cb: progress_cb(min(size_now,total), total)
                time.sleep(0.5)
        t=threading.Thread(target=poll, daemon=True); t.start()
        try:
            snapshot_download(repo_id, local_dir=self.cache_dir, tqdm_class=None, max_workers=4)
        finally:
            stop=True; t.join(timeout=1.0)
            if progress_cb: progress_cb(total,total)

    def load(self, size: str, compute_type: str="auto"):
        return WhisperModel(size, device="auto", compute_type=compute_type, download_root=self.cache_dir)
