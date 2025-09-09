
# -*- coding: utf-8 -*-
import numpy as np
from hr.rppg import RPPGEstimator
import cv2

def synth_frame(freq_hz=1.2, t=0.0, size=80):
    base = np.full((size, size, 3), 180, dtype=np.uint8)
    amp = int(15*np.sin(2*np.pi*freq_hz*t))
    patch = base.copy()
    patch[:,:,1] = np.clip(base[:,:,1] + amp, 0, 255)
    noise = np.random.normal(0, 3, patch.shape).astype(np.int32)
    patch = np.clip(patch.astype(np.int32) + noise, 0, 255).astype(np.uint8)
    return cv2.cvtColor(patch, cv2.COLOR_RGB2BGR)

def test_hr_estimation_basic():
    est = RPPGEstimator(expected_fps=30.0)
    bpm_true = 72.0
    f = bpm_true/60.0
    t=0.0
    for i in range(600):
        frame = synth_frame(f, t, size=80)
        bpm, conf, val, heat = est.update(frame)
        t += 1/30.0
    assert bpm>0
    assert abs(bpm - bpm_true) < 8.0

def test_edge_short_signal():
    est = RPPGEstimator(expected_fps=30.0)
    frame = synth_frame(1.5, 0.0, 80)
    for i in range(20):
        est.update(frame)
    bpm, conf = est._estimate_bpm(np.array([0.1,0.2,0.3]), 30.0)
    assert bpm < 0
