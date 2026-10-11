import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.announcements import router as announcements_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.auth import router as auth_router
from app.api.v1.events import router as events_router
from app.api.v1.finance import router as finance_router
from app.api.v1.fundraisers import router as fundraisers_router
from app.api.v1.members import router as members_router
from app.api.v1.admin import router as admin_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.online_payments import router as online_payments_router
from app.api.v1.report_center import router as report_center_router
from app.api.v1.reports import router as reports_router
from app.api.v1.shop import router as shop_router
from app.api.v1.polls import router as polls_router
from app.api.v1.system import router as system_router
from app.api.v1.webhooks import router as webhooks_router
from app.core.config import settings
from app.core.handlers import register_exception_handlers
from app.core.logging import setup_logging
from app.core.middleware import RealtimeBroadcastMiddleware, RequestIDMiddleware
from app.jobs.email_worker import run_email_worker
from app.jobs.hold_cleanup import release_unpaid_holds
from app.jobs.membership_reminders import send_renewal_reminders
from app.jobs.membership_reminders import send_renewal_reminders

from app.api.v1.websocket import router as ws_router
from app.core.realtime import publish_event, redis_pubsub_listener

setup_logging()
_bg_logger = logging.getLogger(__name__)


async def _hold_cleanup_loop() -> None:
    """Run hold cleanup every 60 seconds indefinitely."""
    while True:
        try:
            result = await release_unpaid_holds()
            if result["released_tickets"] or result["cancelled_orders"]:
                _bg_logger.info("Hold cleanup: %s", result)
                await publish_event("data_changed", {"topic": "events"})
                await publish_event("data_changed", {"topic": "shop"})
                await publish_event("data_changed", {"topic": "dashboard"})
        except Exception as exc:  # noqa: BLE001
            _bg_logger.error("Hold cleanup error: %s", exc)
        await asyncio.sleep(60)


async def _renewal_reminder_loop() -> None:
    """Run the renewal reminder sweep once a day (it is idempotent, so restarts are harmless)."""
    while True:
        try:
            await send_renewal_reminders()
        except Exception as exc:  # noqa: BLE001
            _bg_logger.error("Renewal reminder error: %s", exc)
        await asyncio.sleep(24 * 3600)


async def _renewal_reminder_loop() -> None:
    """Run the renewal reminder sweep once a day (idempotent, so restarts are harmless)."""
    while True:
        try:
            await send_renewal_reminders()
        except Exception as exc:  # noqa: BLE001
            _bg_logger.error("Renewal reminder error: %s", exc)
        await asyncio.sleep(24 * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.APP_ENV not in ("development", "test") and (settings.JWT_SECRET.startswith("default-insecure") or len(settings.JWT_SECRET) < 32):
        raise RuntimeError("JWT_SECRET is weak or still the default. Set a random value of at least 32 characters.")
    # ── Startup ─────────────────────────────────────────────────────────────
    cleanup_task = asyncio.create_task(_hold_cleanup_loop())
    email_task = asyncio.create_task(run_email_worker())
    reminder_task = asyncio.create_task(_renewal_reminder_loop())
    reminder_task = asyncio.create_task(_renewal_reminder_loop())
    ws_pubsub_task = asyncio.create_task(redis_pubsub_listener())
    _bg_logger.info("Background workers started: hold_cleanup, email_worker, ws_pubsub")
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────────
    cleanup_task.cancel()
    email_task.cancel()
    reminder_task.cancel()
    reminder_task.cancel()
    ws_pubsub_task.cancel()
    try:
        await asyncio.gather(cleanup_task, email_task, reminder_task, ws_pubsub_task, return_exceptions=True)
    except Exception:
        pass
    _bg_logger.info("Background workers stopped.")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url=None if settings.APP_ENV == "production" else "/docs",
    redoc_url=None if settings.APP_ENV == "production" else "/redoc",
    openapi_url=None if settings.APP_ENV == "production" else "/openapi.json",
    lifespan=lifespan,
)

@app.middleware("http")
async def security_headers(request, call_next):  # noqa: ANN001
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
    if settings.APP_ENV == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


app.add_middleware(RealtimeBroadcastMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

# Include v1 routers
app.include_router(system_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(members_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")
app.include_router(shop_router, prefix="/api/v1")
app.include_router(announcements_router, prefix="/api/v1")
app.include_router(fundraisers_router, prefix="/api/v1")
app.include_router(finance_router, prefix="/api/v1")
app.include_router(webhooks_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
for _r in (admin_router, notifications_router, online_payments_router, report_center_router, polls_router):
    app.include_router(_r, prefix="/api/v1")
app.include_router(ws_router, prefix="/api/v1")

# Root health check for liveness probes
app.include_router(system_router)
app.include_router(ws_router)



# Uploaded receipts (random, unguessable filenames)
from pathlib import Path as _Path  # noqa: E402

_uploads = _Path(__file__).resolve().parents[1] / "uploads"
_uploads.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads)), name="uploads")
