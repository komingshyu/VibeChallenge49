
# -*- coding: utf-8 -*-
import cv2, numpy as np, time, os
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
LOGS_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

def frame_to_jpeg_bytes(frame, quality=80):
    ok, enc = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    return enc.tobytes() if ok else b""

def apply_overlay_tint(frame, alpha=0.5, color=(0,0,255)):
    overlay = frame.copy()
    tint = np.full_like(frame, color, dtype=np.uint8)
    return cv2.addWeighted(overlay, 1-alpha, tint, alpha, 0)

def safe_log(name, message):
    with open(os.path.join(LOGS_DIR, f"{name}.log"), "a", encoding="utf-8") as f:
        f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
