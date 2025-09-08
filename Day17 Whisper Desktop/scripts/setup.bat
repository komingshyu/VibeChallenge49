@echo off
setlocal EnableExtensions
where python >NUL 2>&1
if errorlevel 1 (
  echo [ERROR] Python 3.9+ is required.
  exit /b 1
)
set "ROOT=%~dp0.."
pushd "%ROOT%"
python -m venv .venv
if errorlevel 1 (
  echo [ERROR] Failed to create venv.
  popd & exit /b 1
)
call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip wheel
if errorlevel 1 (
  echo [ERROR] pip bootstrap failed.
  popd & exit /b 1
)
pip install -r requirements.txt
if errorlevel 1 (
  echo [ERROR] requirements install failed.
  popd & exit /b 1
)
python -c "import imageio_ffmpeg; print('ffmpeg path:', imageio_ffmpeg.get_ffmpeg_exe())"
echo [OK] Setup complete. Run scripts\run.bat
popd
endlocal
