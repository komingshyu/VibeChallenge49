@echo off
setlocal EnableExtensions
set "ROOT=%~dp0.."
pushd "%ROOT%"
call ".venv\Scripts\activate.bat"
pip install pyinstaller
pyinstaller --noconfirm --name WhisperDesktop --windowed whisper_desktop/app.py
echo Output: dist\WhisperDesktop
popd
endlocal
