@echo off
python -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
echo ✅ 安裝完成。請放入 ONNX 權重，設定 .env 後執行 scripts\start.bat
