@echo off
setlocal enabledelayedexpansion
where python
IF %ERRORLEVEL% NEQ 0 (
  echo Python not found. Please install Python 3.10+.
  exit /b 1
)
if not exist .venv (
  python -m venv .venv
)
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
set PYTHONPATH=%CD%
uvicorn app.server:app --host 127.0.0.1 --port 8000 --reload
