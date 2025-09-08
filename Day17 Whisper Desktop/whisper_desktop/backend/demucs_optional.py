import os, tempfile, subprocess
def separate_vocals(input_wav: str):
    try:
        import demucs.separate  # noqa
    except Exception:
        return None
    outdir = tempfile.mkdtemp(prefix="demucs_")
    cmd = ["python", "-m", "demucs.separate", "-n", "htdemucs", "-o", outdir, input_wav]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        # find vocals.wav
        for root, dirs, files in os.walk(outdir):
            if "vocals.wav" in files:
                return os.path.join(root, "vocals.wav")
    except Exception:
        return None
    return None
