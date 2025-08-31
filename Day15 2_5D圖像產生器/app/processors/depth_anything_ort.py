
import os, cv2, numpy as np, onnxruntime as ort

def _ensure_multiple_of_14(h, w):
    import math
    return int(math.ceil(h/14.0)*14), int(math.ceil(w/14.0)*14)

class DepthAnythingORT:
    def __init__(self, onnx_path: str, providers=None):
        if providers is None: providers=['CPUExecutionProvider']
        if not os.path.isfile(onnx_path): raise FileNotFoundError(f"DepthAnything ONNX not found: {onnx_path}")
        self.session = ort.InferenceSession(onnx_path, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.dynamic = any([(x.shape[2] is None) or (x.shape[3] is None) for x in self.session.get_inputs()])

    def preprocess(self, img_bgr: np.ndarray):
        img = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)/255.0
        h,w = img.shape[:2]
        H,W = _ensure_multiple_of_14(h,w) if self.dynamic else (518,518)
        img = cv2.resize(img,(W,H),interpolation=cv2.INTER_CUBIC)
        img = (img-0.5)/0.5
        x = np.transpose(img,(2,0,1))[None,...].astype(np.float32)
        return x, dict(orig_hw=(h,w), net_hw=(H,W))

    def postprocess(self, depth: np.ndarray, meta):
        H,W = meta['net_hw']; h,w = meta['orig_hw']
        d = depth.squeeze(); d = d[0] if d.ndim==3 else d
        dmin,dmax=float(d.min()),float(d.max())
        if dmax-dmin>1e-6: d=(d-dmin)/(dmax-dmin)
        d = cv2.resize(d,(w,h),interpolation=cv2.INTER_CUBIC)
        return d.astype(np.float32)

    def infer(self, img_bgr: np.ndarray):
        x,meta=self.preprocess(img_bgr)
        out=self.session.run(None,{self.input_name:x})[0]
        return self.postprocess(out,meta)

def compute_depth_map(image_bgr: np.ndarray, onnx_path: str) -> np.ndarray:
    return DepthAnythingORT(onnx_path).infer(image_bgr)
