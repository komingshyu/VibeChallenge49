import queue, sounddevice as sd, numpy as np
class MicStream:
    def __init__(self, samplerate: int = 16000, block_size: int = 1024):
        self.samplerate = samplerate; self.block_size = block_size; self.q = queue.Queue(); self.stream=None
    def _cb(self, indata, frames, time_info, status):
        mono = indata.copy()
        if mono.ndim > 1: mono = mono.mean(axis=1, keepdims=False)
        self.q.put(mono.astype(np.float32))
    def start(self):
        self.stream = sd.InputStream(samplerate=self.samplerate, channels=1, blocksize=self.block_size, callback=self._cb); self.stream.start()
    def stop(self):
        if self.stream: self.stream.stop(); self.stream.close(); self.stream=None
    def read_chunk(self, timeout=0.5):
        try: return self.q.get(timeout=timeout)
        except queue.Empty: return None
