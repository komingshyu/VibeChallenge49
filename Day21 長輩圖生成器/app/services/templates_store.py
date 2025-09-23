import json
from pathlib import Path
from typing import Dict, List
from .utils import logger

STORE = Path(__file__).resolve().parents[1] / "assets" / "templates.json"
if not STORE.exists():
    STORE.write_text("[]", encoding="utf-8")

def _read_all() -> List[Dict]:
    try:
        return json.loads(STORE.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error(f"讀取模板失敗: {e}")
        return []

def _write_all(data: List[Dict]) -> None:
    STORE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def list_templates() -> List[Dict]:
    return _read_all()

def create_template(item: Dict) -> Dict:
    data = _read_all()
    item = dict(item)
    if "id" not in item:
        from uuid import uuid4
        item["id"] = str(uuid4())
    data.append(item); _write_all(data); return item

def update_template(tid: str, fields: Dict) -> Dict:
    data = _read_all()
    for i, t in enumerate(data):
        if t.get("id")==tid:
            t.update(fields); data[i]=t; _write_all(data); return t
    raise KeyError("模板不存在")

def delete_template(tid: str) -> bool:
    data = _read_all()
    new = [t for t in data if t.get("id") != tid]
    if len(new)==len(data): return False
    _write_all(new); return True
