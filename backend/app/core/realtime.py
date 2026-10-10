"""Realtime fan-out: local WebSocket clients + Redis pub/sub for multi-worker setups.

If Redis is unavailable, messages are still delivered to every client connected to this
process (in-memory fallback), so a Redis outage never silences the live dashboard.
"""

import asyncio
import json
import logging
import time
import uuid
from typing import Any

from fastapi import WebSocket

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)

CHANNEL = "oddo:v1:events_pubsub"
WORKER_ID = uuid.uuid4().hex


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        dead: set[WebSocket] = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                dead.add(connection)
        for d in dead:
            self.active_connections.discard(d)


manager = ConnectionManager()


async def publish_event(event_type: str, payload: dict[str, Any] | None = None) -> None:
    """Broadcast to local clients immediately, then to other workers through Redis."""
    msg = {"type": event_type, "payload": payload or {}, "timestamp": time.time(), "origin": WORKER_ID}
    await manager.broadcast(msg)
    try:
        await get_redis_client().publish(CHANNEL, json.dumps(msg))
    except Exception as exc:
        logger.warning("Redis publish failed (local clients were still notified): %s", exc)


async def redis_pubsub_listener() -> None:
    """Relay messages published by *other* workers to this worker's clients."""
    delay = 1.0
    while True:
        try:
            # Dedicated connection: a subscriber idles for long periods, so no read timeout
            sub_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2.0)
            pubsub = sub_client.pubsub()
            await pubsub.subscribe(CHANNEL)
            delay = 1.0
            async for message in pubsub.listen():
                if message and message.get("type") == "message":
                    try:
                        data = json.loads(message["data"])
                        if data.get("origin") == WORKER_ID:
                            continue  # already delivered locally
                        await manager.broadcast(data)
                    except Exception as err:
                        logger.warning("Failed to process pubsub message: %s", err)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Redis pub/sub subscriber disconnected, retrying in %.0fs: %s", delay, exc)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 10.0)
