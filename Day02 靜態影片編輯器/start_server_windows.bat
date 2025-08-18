@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem ===== 可調整參數 =====
set "BIND_ADDR=127.0.0.1"
set "BASE_PORT=8082"
set "MAX_SEARCH=100"  rem 最多嘗試 BASE_PORT 起算的 101 個埠（含 BASE_PORT）
set "MAX_WAIT=30"     rem 最多等待服務可回應的秒數（每秒檢查一次）

rem 切到此批次檔所在資料夾
cd /d "%~dp0"

rem 嘗試尋找可用的 Python 命令
set "PYCMD="
where python  >nul 2>nul && set "PYCMD=python"
if not defined PYCMD where py       >nul 2>nul && set "PYCMD=py"
if not defined PYCMD where python3  >nul 2>nul && set "PYCMD=python3"
if not defined PYCMD (
  echo [錯誤] 找不到 Python（python/py/python3 皆不可用）。請先安裝 Python 3 並加入 PATH。
  pause
  exit /b 1
)

rem ===== 自動挑選可用連接埠 =====
set "PORT="
for /l %%N in (0,1,%MAX_SEARCH%) do (
  set /a TRYPORT=BASE_PORT+%%N
  call :IsPortFree !TRYPORT!
  if not errorlevel 1 (
    set "PORT=!TRYPORT!"
    goto :PORT_FOUND
  )
)
echo [錯誤] 自 %BASE_PORT% 起連續 %MAX_SEARCH% 個連接埠皆不可用，無法啟動伺服器。
exit /b 2

:PORT_FOUND
echo [訊息] 使用 Python 命令：%PYCMD%
echo [訊息] 伺服器根目錄：%cd%
echo [訊息] 選定連接埠：%PORT%（基準 %BASE_PORT%）
echo [訊息] 正在啟動 http://localhost:%PORT%/ ...

rem 在新視窗啟動伺服器，保留日誌
start "HTTP Server :%PORT%" cmd /k "%PYCMD% -m http.server %PORT% --bind %BIND_ADDR%"

rem 等待服務可回應後再開瀏覽器
set "URL=http://localhost:%PORT%/"
for /l %%I in (1,1,%MAX_WAIT%) do (
  powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%URL%') > $null; exit 0}catch{ exit 1 }"
  if not errorlevel 1 goto :OPEN_BROWSER
  timeout /t 1 >nul
)

echo [錯誤] 伺服器未在 %MAX_WAIT% 秒內回應，請檢查標題為 'HTTP Server :%PORT%' 的視窗輸出。
goto :END

:OPEN_BROWSER
if exist "%cd%\index.html" (
  set "OPEN_PATH=/index.html"
) else (
  set "OPEN_PATH=/"
)
start "" "http://localhost:%PORT%%OPEN_PATH%"
echo [完成] 已開啟瀏覽器到 http://localhost:%PORT%%OPEN_PATH%

:END
echo [提示] 如要停止伺服器，請關閉標題為 "HTTP Server :%PORT%" 的命令視窗。
exit /b 0

rem ===== 函式：檢查連接埠是否可綁定（回傳 0=可用；1=不可用）=====
:IsPortFree
setlocal EnableExtensions
set "CHKPORT=%~1"
powershell -NoProfile -Command "try{ $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, %CHKPORT% ); $l.Start(); $l.Stop(); exit 0 } catch { exit 1 }"
set "RET=%errorlevel%"
endlocal & exit /b %RET%
