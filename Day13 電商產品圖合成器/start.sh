#!/usr/bin/env bash
set -e
python3 -V
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
export PYTHONPATH=$PYTHONPATH:$(pwd)
# 啟動後端（同時提供前端頁面）
uvicorn app.server:app --host 127.0.0.1 --port 8000 --reload
