@echo off
setlocal
cd /d %~dp0
REM 建立虛擬環境
if not exist .venv (
  py -3 -m venv .venv
)
call .venv\Scripts\activate
pip install --upgrade pip
pip install -r app\requirements.txt
set PORT=7860
python -m app.main
pause
