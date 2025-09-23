from loguru import logger
from pathlib import Path
import sys

LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "app.log"

logger.remove()
logger.add(sys.stderr, level="INFO", enqueue=True, backtrace=False, diagnose=False)
logger.add(LOG_FILE, level="DEBUG", rotation="2 MB", retention=5, enqueue=True)
