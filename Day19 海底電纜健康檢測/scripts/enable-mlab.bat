@echo off
setlocal ENABLEEXTENSIONS

echo ==== Enable M-Lab (BigQuery client) ====

pushd "%~dp0..\backend"
echo Installing @google-cloud/bigquery...
call npm install @google-cloud/bigquery@latest
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Failed to install @google-cloud/bigquery.
  popd
  pause
  exit /b 1
)

echo Rebuilding backend...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Backend build failed.
  popd
  pause
  exit /b 1
)
popd

echo Done. Configure backend\.env for GCP settings if needed.
pause