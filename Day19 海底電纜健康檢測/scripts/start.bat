@echo off
setlocal ENABLEEXTENSIONS

if not exist "%~dp0..\backend\.env" (
  copy "%~dp0..\backend\.env.sample" "%~dp0..\backend\.env" >nul
)

if not exist "%~dp0..\backend\dist\index.js" (
  echo [INFO] Backend not built yet. Building...
  pushd "%~dp0..\backend"
  call npm run build
  popd
)

echo Starting backend on port 8787...
start "backend" cmd /k "cd /d %~dp0..\backend && npm run start"

echo Starting frontend dev server...
start "frontend" cmd /k "cd /d %~dp0..\frontend && npm run dev -- --force"

echo Services are starting. Open http://localhost:5173 in your browser.