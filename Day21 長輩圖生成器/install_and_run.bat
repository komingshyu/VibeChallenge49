@echo off
chcp 950 >nul
setlocal enabledelayedexpansion
title �w�˨ñҰʡG�����ϯ��� v1.0.6
python --version || (echo [���~] �������� Python 3.10+ & goto :end)
where pip >nul 2>nul || (echo [���~] �������� pip & goto :end)
python -m venv .venv
if errorlevel 1 ( echo [���~] venv ���� & goto :end )
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
set PORT=7749
python -m uvicorn app.main:app --host 127.0.0.1 --port %PORT% --reload
:end
