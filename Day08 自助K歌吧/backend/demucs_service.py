import os
import sys
import shutil
import tempfile
from pathlib import Path

import torch
import gc
import demucs.separate

def clear_memory():
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    gc.collect()

def separate_vocals_and_instrumental(audio_path: str, output_dir: str, model_name: str = "htdemucs") -> dict:
    """
    使用 Demucs 將輸入音檔分離為 vocals / no_vocals 兩軌，並輸出到 output_dir。

    回傳:
        {
            "vocals": "/abs/path/to/vocals.wav",
            "no_vocals": "/abs/path/to/no_vocals.wav"
        }
    """
    audio_path = str(audio_path)
    output_dir = str(output_dir)
    os.makedirs(output_dir, exist_ok=True)

    base = os.path.splitext(os.path.basename(audio_path))[0]
    temp_root = tempfile.mkdtemp(prefix="demucs_", dir=output_dir)

    try:
        # 保存原始 argv
        argv_bak = sys.argv[:]
        # 只產生兩軌：vocals / no_vocals
        sys.argv = [
            "demucs.separate",
            "-n", model_name,
            "-o", temp_root,
            "--two-stems", "vocals",
            audio_path
        ]
        demucs.separate.main()
        # 還原 argv
        sys.argv = argv_bak

        # 尋找輸出
        pair_dir = os.path.join(temp_root, model_name, base)
        vocals_src = os.path.join(pair_dir, "vocals.wav")
        no_vocals_src = os.path.join(pair_dir, "no_vocals.wav")

        if not os.path.exists(vocals_src):
            raise FileNotFoundError(f"找不到輸出 {vocals_src}")
        if not os.path.exists(no_vocals_src):
            raise FileNotFoundError(f"找不到輸出 {no_vocals_src}")

        vocals_dst = os.path.join(output_dir, f"{base}_vocals.wav")
        no_vocals_dst = os.path.join(output_dir, f"{base}_no_vocals.wav")

        shutil.copy2(vocals_src, vocals_dst)
        shutil.copy2(no_vocals_src, no_vocals_dst)

        return {"vocals": vocals_dst, "no_vocals": no_vocals_dst}
    except Exception as e:
        raise
    finally:
        try:
            shutil.rmtree(temp_root, ignore_errors=True)
        finally:
            clear_memory()