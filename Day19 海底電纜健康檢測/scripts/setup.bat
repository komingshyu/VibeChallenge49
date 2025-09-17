@echo off
setlocal ENABLEEXTENSIONS

echo ==== TW Subsea Monitor - Setup ====

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Node.js not found. Please install Node.js 18+ and re-run.
  pause
  exit /b 1
)

pushd "%~dp0..\backend"
echo Installing backend dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Backend npm install failed. See the error log above.
  popd
  pause
  exit /b 1
)

echo Building backend...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Backend build failed.
  popd
  pause
  exit /b 1
)
popd

pushd "%~dp0..\frontend"
echo Installing frontend dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Frontend npm install failed.
  popd
  pause
  exit /b 1
)

echo Cleaning Vite optimizer cache...
call npm run clean

echo Building frontend...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Frontend build failed.
  popd
  pause
  exit /b 1
)
popd

echo ==== Setup complete ====
pause