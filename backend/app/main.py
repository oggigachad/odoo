from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.announcements import router as announcements_router
from app.api.v1.auth import router as auth_router
from app.api.v1.events import router as events_router
from app.api.v1.finance import router as finance_router
from app.api.v1.fundraisers import router as fundraisers_router
from app.api.v1.members import router as members_router
from app.api.v1.shop import router as shop_router
from app.api.v1.system import router as system_router
from app.api.v1.webhooks import router as webhooks_router
from app.core.config import settings
from app.core.handlers import register_exception_handlers
from app.core.logging import setup_logging
from app.core.middleware import RequestIDMiddleware

setup_logging()

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

# Root health check for liveness probes
app.include_router(system_router)
