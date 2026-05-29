from __future__ import annotations

import asyncio
from collections import defaultdict

from backend.cv_extractor.schemas import ParseEvent


class EventBroker:
    def __init__(self) -> None:
        self._listeners: dict[str, set[asyncio.Queue[ParseEvent]]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, job_id: str) -> asyncio.Queue[ParseEvent]:
        queue: asyncio.Queue[ParseEvent] = asyncio.Queue()
        async with self._lock:
            self._listeners[job_id].add(queue)
        return queue

    async def unsubscribe(self, job_id: str, queue: asyncio.Queue[ParseEvent]) -> None:
        async with self._lock:
            listeners = self._listeners.get(job_id)
            if not listeners:
                return
            listeners.discard(queue)
            if not listeners:
                self._listeners.pop(job_id, None)

    async def publish(self, event: ParseEvent) -> None:
        async with self._lock:
            listeners = list(self._listeners.get(event.job_id, set()))
        for queue in listeners:
            await queue.put(event)
