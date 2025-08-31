@echo off
call .venv\Scripts\activate
set PYTHONUNBUFFERED=1
uvicorn app.main:app --reload --port 8084 --host 0.0.0.0 --log-level debug
