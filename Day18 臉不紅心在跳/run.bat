@echo off
chcp 950
setlocal enabledelayedexpansion
set VENV_DIR=.venv

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [錯誤] 未找到 Python，請先安裝 Python 3.10+
  pause
  exit /b 1
)

echo [資訊] 建立虛擬環境...
python -m venv %VENV_DIR%
if %ERRORLEVEL% NEQ 0 (
  echo [錯誤] 建立虛擬環境失敗
  pause
  exit /b 2
)

call %VENV_DIR%\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
  echo [錯誤] 安裝套件失敗，請檢查 logs\pip.log
  pip install -r requirements.txt > logs\pip.log 2>&1
  pause
  exit /b 3
)

echo [資訊] 啟動伺服器 http://127.0.0.1:8087/
python -m uvicorn app:app --host 127.0.0.1 --port 8087 --reload
if %ERRORLEVEL% NEQ 0 (
  echo [錯誤] 伺服器啟動失敗
  pause
  exit /b 4
)
