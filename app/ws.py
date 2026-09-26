"""Realtime: every connected client gets {type, operationId, newState} after a write commits."""

import anyio.from_thread
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .auth import origin_allowed, user_from_access_token
from .db import DomainError

router = APIRouter()
# ponytail: in-process registry; fine for one API instance. Use Postgres LISTEN/NOTIFY to fan out across instances.
clients: set[WebSocket] = set()


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    try:
        if not origin_allowed(ws.headers.get("origin"), ws.headers.get("host", "")):
            raise DomainError(403, "forbidden", "Origin not allowed")  # cross-site websocket hijacking
        user_from_access_token(ws.cookies.get("access_token"))
    except DomainError:
        await ws.close(code=4401)
        return
    await ws.accept()
    clients.add(ws)
    try:
        while True:
            await ws.receive_text()  # clients only listen; this just detects disconnects
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(ws)


async def broadcast(event: dict) -> None:
    for ws in list(clients):
        try:
            await ws.send_json(event)
        except Exception:
            clients.discard(ws)


def publish(event: dict) -> None:
    """Call from a sync route AFTER the service's transaction has committed — never before."""
    anyio.from_thread.run(broadcast, event)
