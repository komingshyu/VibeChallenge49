import os, numpy as np, cv2
from typing import Tuple, Dict, List
import onnxruntime as ort
from ultralytics import YOLO

def _expected_batch_from_onnx(onnx_path: str) -> int:
    try:
        sess = ort.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
        shape = sess.get_inputs()[0].shape
        b = shape[0] if isinstance(shape, (list,tuple)) else 1
        return b if isinstance(b,int) and b>0 else 1
    except Exception:
        return 1

def load_yolo11_seg(onnx_path: str, device: str = "cpu") -> YOLO:
    if not os.path.isfile(onnx_path):
        raise FileNotFoundError(f"YOLO11 m-seg ONNX not found: {onnx_path}")
    model = YOLO(onnx_path)
    model.overrides["device"] = device
    model.expected_batch = _expected_batch_from_onnx(onnx_path)
    return model

def _predict(model: YOLO, rgb: np.ndarray):
    try:
        if getattr(model, "expected_batch", 1) > 1:
            return model.predict([rgb] * model.expected_batch, verbose=False, batch=model.expected_batch)[0]
        return model.predict(rgb, verbose=False, batch=1)[0]
    except Exception:
        return model.predict([rgb, rgb], verbose=False, batch=2)[0]

def person_instances(model: YOLO, bgr: np.ndarray,
                     conf_th: float = 0.25) -> List[Dict]:
    """
    回傳 [{"id", "mask"(HxW uint8/0~255), "bbox",[x1,y1,x2,y2], "conf"}]
    """
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    h, w = bgr.shape[:2]
    res = _predict(model, rgb)
    out: List[Dict] = []

    if getattr(res, "masks", None) is None or getattr(res, "boxes", None) is None:
        return out

    mdata = getattr(res.masks, 'data', None)
    if mdata is None:
        return out

    mdata = mdata.cpu().numpy()  # N x h' x w'
    classes = res.boxes.cls.cpu().numpy().astype(int)
    confs = res.boxes.conf.cpu().numpy()
    xyxy = res.boxes.xyxy.cpu().numpy()

    idx = 0
    for i, cls_id in enumerate(classes):
        if cls_id == 0 and confs[i] >= conf_th:  # 0 = person
            m_small = mdata[i]
            m = cv2.resize(m_small, (w, h), interpolation=cv2.INTER_NEAREST)
            mask_u8 = ((m > 0.5).astype(np.uint8)) * 255   # ← 一律 0/255
            x1,y1,x2,y2 = xyxy[i].tolist()
            out.append({
                "id": idx,
                "mask": mask_u8,
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "conf": float(confs[i])
            })
            idx += 1
    return out

def union_mask(instances: List[Dict], hw: Tuple[int,int]) -> np.ndarray:
    """回傳 uint8 0/255 的 union 遮罩"""
    h, w = hw
    u = np.zeros((h, w), dtype=np.uint8)
    for inst in instances:
        m = inst["mask"]
        if m.dtype != np.uint8:
            m = (m > 0).astype(np.uint8) * 255
        u = np.maximum(u, m)
    return u
