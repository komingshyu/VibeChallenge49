
# -*- coding: utf-8 -*-
import numpy as np, cv2, time
from scipy import signal
from collections import deque

def butter_bandpass(lowcut, highcut, fs, order=3):
    nyq = 0.5 * fs
    low = max(0.001, lowcut / nyq); high = min(0.999, highcut / nyq)
    return signal.butter(order, [low, high], btype='bandpass', output='sos')

class RPPGEstimator:
    def __init__(self, expected_fps: float = 30.0, window_seconds: float = 15.0,
                 low_hz: float = 0.7, high_hz: float = 3.0, heat_size: int = 56):
        self.fs = expected_fps
        self.window_seconds = window_seconds
        self.window_len = int(self.fs * self.window_seconds)
        self.low_hz = low_hz; self.high_hz = high_hz
        self.rgb_means = deque(maxlen=max(64, self.window_len))
        self.timestamps = deque(maxlen=max(64, self.window_len))
        numtaps = int(self.fs * 1.5); numtaps += (numtaps % 2 == 0)
        self.fir = signal.firwin(numtaps, [low_hz, high_hz], pass_zero='bandpass', fs=self.fs)
        self.roi_buffer = deque(maxlen=max(64, 2*numtaps))
        self.heat_size = heat_size

    def _estimate_fs_from_timestamps(self):
        if len(self.timestamps) < 6: return self.fs
        t = np.array(self.timestamps); dt = np.diff(t); med = np.median(dt)
        if med > 0: self.fs = 1.0/med
        return self.fs

    def _chrom_signal(self, rgb_seq):
        rgb = np.asarray(rgb_seq, dtype=np.float64)
        mean_rgb = np.mean(rgb, axis=0) + 1e-8
        norm = (rgb / mean_rgb) - 1.0
        X = 3*norm[:,0] - 2*norm[:,1]
        Y = 1.5*norm[:,0] + norm[:,1] - 1.5*norm[:,2]
        sX = np.std(X)+1e-8; sY = np.std(Y)+1e-8
        alpha = sX/sY; S = X - alpha*Y
        return S

    def _estimate_bpm(self, signal_vec, fs):
        if len(signal_vec) < int(4*fs): return -1.0, 0.0
        detr = signal.detrend(signal_vec)
        sos = butter_bandpass(self.low_hz, self.high_hz, fs)
        filtered = signal.sosfiltfilt(sos, detr)
        freqs, psd = signal.welch(filtered, fs=fs, nperseg=min(len(filtered), int(4*fs)))
        mask = (freqs >= self.low_hz) & (freqs <= self.high_hz)
        if not np.any(mask): return -1.0, 0.0
        idx = np.argmax(psd[mask]); peak = freqs[mask][idx]
        bpm = float(peak*60.0)
        conf = float(psd[mask][idx] / (np.sum(psd[mask])+1e-8))
        return bpm, conf

    def update(self, roi_bgr):
        roi = cv2.resize(roi_bgr, (self.heat_size, self.heat_size), interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        mask = (hsv[:,:,1] > 20) & (hsv[:,:,2] > 50)
        mean_rgb = np.mean(rgb[mask], axis=0) if np.any(mask) else np.mean(rgb.reshape(-1,3), axis=0)

        self.rgb_means.append(mean_rgb)
        self.timestamps.append(time.time())
        fs = self._estimate_fs_from_timestamps()

        chrom = self._chrom_signal(self.rgb_means)
        green = np.array(self.rgb_means)[:,1]
        green = (green - np.mean(green)) / (np.std(green)+1e-8)
        fused = 0.7*chrom[-len(green):] + 0.3*green

        bpm, conf = self._estimate_bpm(fused, fs)
        val = float(np.tanh(fused[-1] if len(fused)>0 else 0.0))

        self.roi_buffer.append(rgb[:,:,1].astype(np.float32)/255.0)
        heat = np.zeros((self.heat_size, self.heat_size), dtype=np.float32)
        if len(self.roi_buffer) >= len(self.fir):
            stack = np.stack(self.roi_buffer, axis=0)
            sub = stack[-len(self.fir):,:,:]
            heat = np.tensordot(self.fir, sub, axes=(0,0))
            heat = np.abs(heat)
            m = np.percentile(heat, 95)
            heat = np.clip(heat / m, 0, 1) if m>1e-6 else heat*0
        return bpm, conf, val, heat
