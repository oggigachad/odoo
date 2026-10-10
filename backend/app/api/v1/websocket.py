import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.realtime import manager, publish_event, redis_pubsub_listener  # noqa: F401

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Realtime WebSockets"])


@router.websocket("/ws/updates")
async def websocket_updates(websocket: WebSocket) -> None:
    # Only pages served from our own site may listen (blocks other sites from hijacking the socket)
    origin = (websocket.headers.get("origin") or "").rstrip("/")
    if origin and origin not in settings.allowed_origins:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket)
    try:
        await websocket.send_json({"type": "connection_established", "status": "connected"})
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        logger.info("WebSocket closed: %s", exc)
        manager.disconnect(websocket)
