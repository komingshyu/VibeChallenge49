@echo off
setlocal EnableExtensions
set "ROOT=%~dp0.."
pushd "%ROOT%"
if not exist ".venv\Scripts\activate.bat" (
  echo [ERROR] venv not found. Run scripts\setup.bat
  popd & exit /b 1
)
call ".venv\Scripts\activate.bat"
python -m whisper_desktop.app
set "CODE=%ERRORLEVEL%"
popd
endlocal & exit /b %CODE%
