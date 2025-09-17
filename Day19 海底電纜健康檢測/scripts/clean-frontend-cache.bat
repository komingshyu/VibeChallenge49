@echo off
setlocal ENABLEEXTENSIONS

echo ==== Clean Vite optimizer cache ====
if exist "%~dp0..\frontend\node_modules\.vite" (
  rmdir /S /Q "%~dp0..\frontend\node_modules\.vite"
  echo Removed frontend\node_modules\.vite
) else (
  echo Nothing to clean.
)
pause