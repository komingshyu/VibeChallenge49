#!/usr/bin/env bash
set -e
source .venv/bin/activate
export PYTHONUNBUFFERED=1
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0 --log-level debug
