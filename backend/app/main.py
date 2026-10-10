from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.system import router as system_router
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
# Root health check for liveness probes
app.include_router(system_router)
