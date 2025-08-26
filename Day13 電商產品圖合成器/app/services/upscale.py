from __future__ import annotations
import os
import io
import math
from typing import Tuple

import numpy as np
from PIL import Image

try:
    import onnxruntime as ort
    _ORT_OK = True
except Exception:
    _ORT_OK = False


class UpscaleNotAvailable(Exception):
    pass


class Upscaler:
    def __init__(self, weights_path: str) -> None:
        self.weights_path = weights_path
        self.available = _ORT_OK and os.path.exists(weights_path)
        self._session = None

    def _maybe_init(self):
        if not self.available:
            raise UpscaleNotAvailable("缺少 onnxruntime 或權重檔 (app/weights/real_esrgan_x4.onnx)")
        if self._session is None:
            providers = ["CPUExecutionProvider"]
            self._session = ort.InferenceSession(self.weights_path, providers=providers)

    def upscale_image_bytes(self, img_bytes: bytes) -> bytes:
        self._maybe_init()
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        up = self._infer_realesrgan(img)
        buf = io.BytesIO()
        up.save(buf, format="PNG")
        return buf.getvalue()

    def _infer_realesrgan(self, img: Image.Image) -> Image.Image:
        # Basic RealESRGAN ONNX inference with minimal assumptions.
        sess = self._session
        inp_name = sess.get_inputs()[0].name
        out_name = sess.get_outputs()[0].name

        # Convert to NCHW float32 0..1
        arr = np.array(img).astype(np.float32) / 255.0  # HWC RGB
        h, w = arr.shape[:2]

        # Many ESRGAN models prefer dimensions multiple of 4
        pad_h = (4 - h % 4) % 4
        pad_w = (4 - w % 4) % 4
        if pad_h or pad_w:
            arr = np.pad(arr, ((0, pad_h), (0, pad_w), (0, 0)), mode="reflect")

        nchw = np.transpose(arr, (2, 0, 1))[None, ...]

        try:
            out = sess.run([out_name], {inp_name: nchw})[0]
        except Exception:
            # Fallback to tiled inference for memory errors or size mismatches
            tile = 256
            overlap = 16
            out = self._tiled_infer(sess, inp_name, out_name, nchw, tile, overlap)

        # Post-process back to image
        out = np.squeeze(out, 0)  # CHW
        out = np.transpose(out, (1, 2, 0))  # HWC
        out = np.clip(out, 0.0, 1.0)
        out = (out * 255.0 + 0.5).astype(np.uint8)

        # Remove padding (scale x4 assumed)
        scale = 4
        oh, ow = arr.shape[:2]
        oh4, ow4 = oh * scale, ow * scale
        out = out[:oh4, :ow4, :]

        return Image.fromarray(out, mode="RGB")

    def _tiled_infer(self, sess, inp_name, out_name, nchw, tile: int, overlap: int):
        # nchw: 1 x C x H x W
        _, c, H, W = nchw.shape
        scale = 4  # RealESRGAN x4
        out = np.zeros((1, c, H * scale, W * scale), dtype=np.float32)

        for y in range(0, H, tile - overlap):
            for x in range(0, W, tile - overlap):
                y0, x0 = y, x
                y1, x1 = min(y + tile, H), min(x + tile, W)
                patch = nchw[:, :, y0:y1, x0:x1]
                # pad patch if needed
                ph = (4 - (y1 - y0) % 4) % 4
                pw = (4 - (x1 - x0) % 4) % 4
                if ph or pw:
                    patch = np.pad(patch, ((0,0),(0,0),(0,ph),(0,pw)), mode="reflect")
                pred = sess.run([out_name], {inp_name: patch})[0]
                _, _, ph_out, pw_out = pred.shape
                # remove pad in output correspondingly
                ph_trim = ph * scale
                pw_trim = pw * scale
                pred = pred[:, :, :ph_out - ph_trim, :pw_out - pw_trim]
                out[:, :, y0*scale:y0*scale+pred.shape[2], x0*scale:x0*scale+pred.shape[3]] = pred
        return out
