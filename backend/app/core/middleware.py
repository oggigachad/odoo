import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

request_id_context: ContextVar[str] = ContextVar("request_id", default="")


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_context.set(req_id)
        request.state.request_id = req_id
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = req_id
            return response
        finally:
            request_id_context.reset(token)


_TOPIC_BY_SEGMENT = {
    "events": "events",
    "tickets": "events",
    "checkin": "events",
    "products": "shop",
    "orders": "shop",
    "announcements": "announcements",
    "fundraisers": "fundraisers",
    "payments": "finance",
    "expenses": "finance",
    "treasurer": "finance",
    "members": "members",
    "memberships": "members",
    "membership-types": "members",
    "semesters": "members",
    "leadership": "members",
    "webhooks": "finance",
    "notifications": "notifications",
    "admin": "members",
}


class RealtimeBroadcastMiddleware(BaseHTTPMiddleware):
    """After any successful write under /api/v1, tell connected clients which topic changed."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        if request.method in ("POST", "PATCH", "PUT", "DELETE") and response.status_code < 400:
            parts = [p for p in request.url.path.split("/") if p]
            if len(parts) >= 3 and parts[0] == "api" and parts[1] == "v1":
                topic = _TOPIC_BY_SEGMENT.get(parts[2])
                if topic:
                    from app.core.realtime import publish_event

                    await publish_event("data_changed", {"topic": topic})
                    if topic in ("events", "shop", "finance", "members"):
                        await publish_event("data_changed", {"topic": "dashboard"})
        return response
