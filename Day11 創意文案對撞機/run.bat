@echo off
cd /d %~dp0

if not exist .venv (
  py -3 -m venv .venv
)

call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

set PYTHONUNBUFFERED=1
set PORT=%PORT%
if "%PORT%"=="" set PORT=8000
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port %PORT%
