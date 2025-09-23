@echo off
chcp 950 >nul
setlocal enabledelayedexpansion
title 安裝並啟動：長輩圖神器 v1.0.6
python --version || (echo [錯誤] 未偵測到 Python 3.10+ & goto :end)
where pip >nul 2>nul || (echo [錯誤] 未偵測到 pip & goto :end)
python -m venv .venv
if errorlevel 1 ( echo [錯誤] venv 失敗 & goto :end )
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
set PORT=7749
python -m uvicorn app.main:app --host 127.0.0.1 --port %PORT% --reload
:end
