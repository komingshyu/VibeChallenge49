@echo off
chcp 950
setlocal enabledelayedexpansion
set VENV_DIR=.venv

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [���~] ����� Python�A�Х��w�� Python 3.10+
  pause
  exit /b 1
)

echo [��T] �إߵ�������...
python -m venv %VENV_DIR%
if %ERRORLEVEL% NEQ 0 (
  echo [���~] �إߵ������ҥ���
  pause
  exit /b 2
)

call %VENV_DIR%\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
  echo [���~] �w�ˮM�󥢱ѡA���ˬd logs\pip.log
  pip install -r requirements.txt > logs\pip.log 2>&1
  pause
  exit /b 3
)

echo [��T] �Ұʦ��A�� http://127.0.0.1:8087/
python -m uvicorn app:app --host 127.0.0.1 --port 8087 --reload
if %ERRORLEVEL% NEQ 0 (
  echo [���~] ���A���Ұʥ���
  pause
  exit /b 4
)
