import logging, os
from concurrent_log_handler import ConcurrentRotatingFileHandler
def setup_logger(log_dir: str):
    os.makedirs(log_dir, exist_ok=True)
    path = os.path.join(log_dir, "app.log")
    logger = logging.getLogger("whisper_desktop")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        fh = ConcurrentRotatingFileHandler(path, maxBytes=5*1024*1024, backupCount=3, encoding="utf-8")
        fh.setFormatter(fmt); logger.addHandler(fh)
        sh = logging.StreamHandler(); sh.setFormatter(fmt); logger.addHandler(sh)
    return logger
