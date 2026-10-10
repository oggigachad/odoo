from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(tags=["System"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready(db: AsyncSession = Depends(get_db)) -> Response:
    try:
        await db.execute(text("SELECT 1"))
        return Response(content='{"status":"ready"}', media_type="application/json", status_code=200)
    except Exception:
        return Response(content='{"status":"not_ready"}', media_type="application/json", status_code=503)


@router.get("/config")
async def get_config() -> dict[str, bool]:
    return {"ads_enabled": True}
