
import os, io, base64, uuid, asyncio
from PIL import Image, ImageOps

SUPPORTED_SIZES = [(1024,1024), (1536,1024), (1024,1536)]

def ensure_dirs(*dirs):
    for d in dirs:
        os.makedirs(d, exist_ok=True)

def unique_id(prefix='task'):
    return f"{prefix}_{uuid.uuid4().hex[:10]}"

def resize_to_supported_size(img: Image.Image, prefer: str='auto'):
    w, h = img.size
    if prefer=='landscape':
        candidates=[s for s in SUPPORTED_SIZES if s[0]>s[1]]
    elif prefer=='portrait':
        candidates=[s for s in SUPPORTED_SIZES if s[1]>s[0]]
    elif prefer=='square':
        candidates=[s for s in SUPPORTED_SIZES if s[0]==s[1]]
    else:
        candidates=SUPPORTED_SIZES
    def score(t): tw,th=t; return abs(w/h - tw/th)
    best=min(candidates,key=score)
    out=ImageOps.pad(img, best, color=(0,0,0), centering=(0.5,0.5))
    return out, best

class SSEQueue:
    def __init__(self): self.q=asyncio.Queue()
    async def push(self, event, data): await self.q.put({'event': event, 'data': data})
    async def consume(self):
        while True:
            item = await self.q.get()
            yield item
            self.q.task_done()
