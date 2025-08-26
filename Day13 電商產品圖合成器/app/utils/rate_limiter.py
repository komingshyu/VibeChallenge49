from __future__ import annotations
import asyncio
import time
from contextlib import asynccontextmanager


class AsyncRateLimiter:
    """A simple concurrency+interval limiter for async tasks.

    - max_concurrency: maximum tasks running at once
    - min_interval_ms: ensure at least this interval between enters
    """
    def __init__(self, max_concurrency: int = 2, min_interval_ms: int = 300):
        self._sem = asyncio.Semaphore(max_concurrency)
        self._min_interval = max(0, min_interval_ms) / 1000.0
        self._last_enter = 0.0
        self._lock = asyncio.Lock()

    def set_limits(self, max_concurrency: int, min_interval_ms: int):
        self._sem = asyncio.Semaphore(max(1, int(max_concurrency)))
        self._min_interval = max(0, int(min_interval_ms)) / 1000.0

    @asynccontextmanager
    async def throttle(self):
        await self._sem.acquire()
        await self._respect_interval()
        try:
            yield
        finally:
            self._sem.release()

    async def _respect_interval(self):
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_enter
            if elapsed < self._min_interval:
                await asyncio.sleep(self._min_interval - elapsed)
            self._last_enter = time.monotonic()
