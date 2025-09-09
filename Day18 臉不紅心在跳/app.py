
# -*- coding: utf-8 -*-
import os
import cv2
import time
import json
import base64
import uuid
import threading
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from hr.detector import FaceDetector
from hr.rppg import RPPGEstimator
from hr.utils import frame_to_jpeg_bytes, apply_overlay_tint, safe_log
from typing import Optional, Dict, Any

app = FastAPI(title="臉不紅心在跳", version="0.2.0")

APP_DIR = os.path.dirname(__file__)
STATIC_DIR = os.path.join(APP_DIR, "static")
LOGS_DIR = os.path.join(APP_DIR, "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# In-memory storage
MEASUREMENTS: Dict[str, Dict[str, Any]] = {}
MEASUREMENTS_LOCK = threading.Lock()
JOBS: Dict[str, Dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()

@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

class MeasurementCreate(BaseModel):
    name: str = "Unnamed"
    notes: Optional[str] = None

class MeasurementUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None

@app.post("/api/measurements")
def create_measurement(m: MeasurementCreate):
    try:
        with MEASUREMENTS_LOCK:
            mid = str(uuid.uuid4())
            MEASUREMENTS[mid] = {"id": mid, "name": m.name, "notes": m.notes, "created_at": time.time(), "samples": []}
        return {"ok": True, "id": mid}
    except Exception as e:
        safe_log("measurements", f"create error: {e}")
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.patch("/api/measurements/{mid}")
def update_measurement(mid: str, m: MeasurementUpdate):
    try:
        with MEASUREMENTS_LOCK:
            if mid not in MEASUREMENTS:
                return JSONResponse({"ok": False, "error": "not found"}, status_code=404)
            if m.name is not None: MEASUREMENTS[mid]["name"] = m.name
            if m.notes is not None: MEASUREMENTS[mid]["notes"] = m.notes
        return {"ok": True}
    except Exception as e:
        safe_log("measurements", f"update error: {e}")
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.delete("/api/measurements/{mid}")
def delete_measurement(mid: str):
    with MEASUREMENTS_LOCK:
        if mid in MEASUREMENTS:
            del MEASUREMENTS[mid]; return {"ok": True}
        return JSONResponse({"ok": False, "error": "not found"}, status_code=404)

@app.get("/api/measurements")
def list_measurements():
    with MEASUREMENTS_LOCK:
        items = list(MEASUREMENTS.values())
    return {"ok": True, "items": items}

def process_video_job(job_id: str, path: str, mid: Optional[str], enable_crop: bool=False, zoom: float=1.4):
    try:
        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fd = FaceDetector()
        est = RPPGEstimator(expected_fps=fps)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480)
        out_path = os.path.join(LOGS_DIR, f"{os.path.basename(path)}.overlay.mp4")
        writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))

        def smart_crop_rect(face_box, frame_w, frame_h, zoom):
            x,y,w,h = face_box
            cx = x + w/2.0
            cy = y + h*0.42  # 偏上對齊額頭
            tw = w*zoom; th = h*zoom
            aspect = frame_w / frame_h
            if tw/th < aspect: tw = th*aspect
            else: th = tw/aspect
            x0 = int(round(cx - tw/2)); y0 = int(round(cy - th/2))
            x0 = max(0, min(frame_w - int(round(tw)), x0))
            y0 = max(0, min(frame_h - int(round(th)), y0))
            tw = int(round(min(tw, frame_w)))
            th = int(round(min(th, frame_h)))
            return x0, y0, tw, th

        last_crop = None
        processed = 0
        t0 = time.time()

        while True:
            ret, frame = cap.read()
            if not ret: break
            face = fd.detect_one(frame)

            # 裁切到臉部附近
            if enable_crop and face is not None:
                x0,y0,tw,th = smart_crop_rect(face, frame.shape[1], frame.shape[0], zoom)
                if last_crop is None: last_crop = (x0,y0,tw,th)
                else:
                    lx,ly,lw,lh = last_crop
                    alpha = 0.15
                    x0 = int(round(alpha*x0 + (1-alpha)*lx))
                    y0 = int(round(alpha*y0 + (1-alpha)*ly))
                    tw = int(round(alpha*tw + (1-alpha)*lw))
                    th = int(round(alpha*th + (1-alpha)*lh))
                    last_crop = (x0,y0,tw,th)
                sub = frame[y0:y0+th, x0:x0+tw]
                frame = cv2.resize(sub, (width, height), interpolation=cv2.INTER_LINEAR)
                # 更新 face 座標到裁切座標系
                fx,fy,fw,fh = face
                fx, fy = fx - x0, fy - y0
                scale_x, scale_y = width/max(1,tw), height/max(1,th)
                face = (int(fx*scale_x), int(fy*scale_y), int(fw*scale_x), int(fh*scale_y))

            if face is None:
                overlay = apply_overlay_tint(frame, alpha=0.4, color=(0, 0, 255))
                writer.write(overlay)
                processed += 1
                with JOBS_LOCK: JOBS[job_id]["progress"] = processed / max(1, total)
                continue

            x, y, w, h = face
            roi = frame[y:y+h, x:x+w]
            bpm, conf, signal_value, heat = est.update(roi)

            # 疊熱力圖
            overlay_frame = frame.copy()
            heat_color = cv2.applyColorMap((heat*255).astype(np.uint8), cv2.COLORMAP_JET)
            heat_color = cv2.resize(heat_color, (w, h), interpolation=cv2.INTER_LINEAR)
            roi_overlay = cv2.addWeighted(frame[y:y+h, x:x+w], 0.4, heat_color, 0.6, 0)
            overlay_frame[y:y+h, x:x+w] = roi_overlay
            txt = f"BPM: {int(round(bpm)) if bpm>0 else '--'}  conf:{conf:.2f}"
            cv2.rectangle(overlay_frame, (x, y), (x+w, y+h), (0,255,0), 2)
            cv2.putText(overlay_frame, txt, (x, y-8), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)

            writer.write(overlay_frame)
            processed += 1
            with JOBS_LOCK:
                JOBS[job_id]["progress"] = processed / max(1, total)
                JOBS[job_id]["last_bpm"] = bpm
                JOBS[job_id]["last_conf"] = conf
            if mid is not None and bpm>0:
                with MEASUREMENTS_LOCK:
                    if mid in MEASUREMENTS:
                        MEASUREMENTS[mid]["samples"].append([time.time(), float(bpm), float(conf)])

        cap.release(); writer.release()
        with JOBS_LOCK:
            JOBS[job_id]["done"] = True
            JOBS[job_id]["overlay_path"] = out_path
            JOBS[job_id]["elapsed"] = time.time() - t0
    except Exception as e:
        safe_log("process_video_job", f"{e}")
        with JOBS_LOCK:
            JOBS[job_id]["done"] = True
            JOBS[job_id]["error"] = str(e)

@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...), mid: Optional[str] = Form(None),
                       crop: Optional[str] = Form(None), zoom: Optional[str] = Form(None)):
    try:
        suffix = os.path.splitext(file.filename or "")[-1] or ".mp4"
        job_id = str(uuid.uuid4())
        save_path = os.path.join(LOGS_DIR, f"{job_id}{suffix}")
        with open(save_path, "wb") as f: f.write(await file.read())

        with JOBS_LOCK:
            JOBS[job_id] = {"progress": 0.0, "done": False, "overlay_path": None, "error": None,
                            "cfg": {"crop": bool(crop), "zoom": float(zoom) if zoom else 1.4}}
        th = threading.Thread(target=process_video_job,
                              args=(job_id, save_path, mid, bool(crop), float(zoom) if zoom else 1.4),
                              daemon=True)
        th.start()
        return {"ok": True, "job_id": job_id}
    except Exception as e:
        safe_log("upload_video", f"{e}")
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.get("/api/progress/{job_id}")
def job_progress(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job: return JSONResponse({"ok": False, "error": "unknown job"}, status_code=404)
        return {"ok": True, **job}

@app.get("/api/download/{job_id}")
def job_download(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job or not job.get("overlay_path"):
            return JSONResponse({"ok": False, "error": "not ready"}, status_code=404)
        path = job["overlay_path"]
    if not os.path.exists(path):
        return JSONResponse({"ok": False, "error": "file missing"}, status_code=404)
    return FileResponse(path, filename=os.path.basename(path))

@app.websocket("/ws/stream")
async def ws_stream(ws: WebSocket):
    await ws.accept()
    detector = FaceDetector()
    estimator = RPPGEstimator()
    measurement_id = None
    try:
        while True:
            msg = await ws.receive_text()
            obj = json.loads(msg)
            if obj.get("type") == "start":
                measurement_id = obj.get("mid")
                await ws.send_text(json.dumps({"type":"status", "message":"stream_started"}))
                continue
            if obj.get("type") != "frame": continue
            img_b64 = obj["data"]
            raw = base64.b64decode(img_b64.split(",")[-1])
            arr = np.frombuffer(raw, dtype=np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                await ws.send_text(json.dumps({"type":"log", "message":"bad frame"}))
                continue
            face = detector.detect_one(frame)
            if face is not None:
                x, y, w, h = face
                roi = frame[y:y+h, x:x+w]
                bpm, conf, signal_value, heat = estimator.update(roi)
                heat_color = cv2.applyColorMap((heat*255).astype(np.uint8), cv2.COLORMAP_JET)
                heat_color = cv2.resize(heat_color, (w, h), interpolation=cv2.INTER_LINEAR)
                overlay_frame = frame.copy()
                overlay_roi = cv2.addWeighted(frame[y:y+h, x:x+w], 0.4, heat_color, 0.6, 0)
                overlay_frame[y:y+h, x:x+w] = overlay_roi
                cv2.rectangle(overlay_frame, (x, y), (x+w, y+h), (0,255,0), 2)
                jpg = frame_to_jpeg_bytes(overlay_frame, quality=72)
                overlay_b64 = "data:image/jpeg;base64," + base64.b64encode(jpg).decode("ascii")
            else:
                bpm, conf, signal_value = -1, 0.0, 0.0
                overlay_b64 = None
            if measurement_id and bpm>0:
                with MEASUREMENTS_LOCK:
                    if measurement_id in MEASUREMENTS:
                        MEASUREMENTS[measurement_id]["samples"].append([time.time(), float(bpm), float(conf)])
            payload = {"type": "metrics", "bpm": bpm, "confidence": conf,
                       "signal_value": signal_value, "overlay": overlay_b64, "ts": time.time()}
            await ws.send_text(json.dumps(payload))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        safe_log("ws_stream", f"error: {e}")
        try:
            await ws.send_text(json.dumps({"type":"error", "message": str(e)}))
        except: pass
