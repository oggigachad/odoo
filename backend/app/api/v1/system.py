import json

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import check_redis_health

router = APIRouter(tags=["System"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready(db: AsyncSession = Depends(get_db)) -> Response:
    try:
        await db.execute(text("SELECT 1"))
        db_status = "up"
    except Exception:
        return Response(
            content=json.dumps({"status": "not_ready", "database": "down"}),
            media_type="application/json",
            status_code=503,
        )

    redis_ok = await check_redis_health()
    redis_status = "up" if redis_ok else "down"

    return Response(
        content=json.dumps({"status": "ready", "database": db_status, "redis": redis_status}),
        media_type="application/json",
        status_code=200,
    )


@router.get("/config")
async def get_config() -> dict[str, bool]:
    return {"ads_enabled": True}
