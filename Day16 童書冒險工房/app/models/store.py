
import json, os, uuid, time
from typing import Dict, Any, List

ROOT = os.path.join(os.path.dirname(__file__), "..", "storage")
os.makedirs(ROOT, exist_ok=True)

def _path(name: str) -> str:
    return os.path.join(ROOT, name)

def load(name: str, default):
    try:
        with open(_path(name), "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default

def save(name: str, data):
    with open(_path(name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def new_project() -> str:
    pid = str(uuid.uuid4())
    save(f"project_{pid}.json", {"id": pid, "created": time.time(), "characters": [], "storyboard": {}})
    return pid

def get_project(pid: str) -> Dict[str, Any]:
    return load(f"project_{pid}.json", {})

def put_project(pid: str, data: Dict[str, Any]):
    save(f"project_{pid}.json", data)

def list_projects() -> List[Dict[str, Any]]:
    files = [f for f in os.listdir(ROOT) if f.startswith("project_")]
    return [load(f, {}) for f in files]
