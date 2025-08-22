#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

# 啟動
export PYTHONUNBUFFERED=1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port ${PORT:-8000}
