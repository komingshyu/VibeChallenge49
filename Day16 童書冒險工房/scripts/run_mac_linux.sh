
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
python3 -m venv .venv || true
source .venv/bin/activate
pip install --upgrade pip
pip install -r app/requirements.txt
export PORT=${PORT:-7860}
python -m app.main
