#!/bin/bash
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  python3 start.py
elif command -v python >/dev/null 2>&1; then
  python start.py
else
  echo "未偵測到 Python，請手動用瀏覽器開啟 index.html（部分功能可能受限）。"
  xdg-open index.html || open index.html
fi
