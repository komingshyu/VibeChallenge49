import io
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse

from .demucs_service import separate_vocals_and_instrumental

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
STORAGE_DIR = BASE_DIR / "storage"
STORAGE_DIR.mkdir(exist_ok=True, parents=True)

app = FastAPI(title="Self-Serve KTV (Demucs)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 靜態檔案：前端與輸出檔
app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR)), name="assets")
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")

@app.get("/", response_class=HTMLResponse)
def root():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return index.read_text(encoding="utf-8")
    return HTMLResponse("<h1>Frontend not found.</h1>")

@app.post("/api/separate")
async def separate(file: UploadFile = File(...), model: Optional[str] = "htdemucs"):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename.")

    # 儲存上傳音檔到 session 目錄
    session_id = uuid.uuid4().hex[:8]
    session_dir = STORAGE_DIR / f"session_{session_id}"
    session_dir.mkdir(parents=True, exist_ok=True)

    in_path = session_dir / file.filename
    data = await file.read()
    with open(in_path, "wb") as f:
        f.write(data)

    try:
        result = separate_vocals_and_instrumental(str(in_path), str(session_dir), model_name=model or "htdemucs")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Separation failed: {e}")

    # 產出可下載的 URL
    vocals_rel = os.path.relpath(result["vocals"], STORAGE_DIR)
    nobox_rel = os.path.relpath(result["no_vocals"], STORAGE_DIR)

    payload = {
        "session": session_id,
        "original": f"/storage/{os.path.relpath(in_path, STORAGE_DIR)}",
        "vocals": f"/storage/{vocals_rel}",
        "instrumental": f"/storage/{nobox_rel}",
    }
    return JSONResponse(payload)

@app.get("/api/health")
def health():
    return {"ok": True}