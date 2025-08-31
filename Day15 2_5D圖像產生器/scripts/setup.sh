#!/usr/bin/env bash
set -e
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo '✅ 安裝完成。請放 ONNX 權重，設定 .env 後執行 scripts/start.sh'
