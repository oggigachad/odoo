import datetime as dt
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_member
from app.core.database import get_db
from app.schemas.auth import MemberInfo
from app.services.dashboard_service import DashboardService

router = APIRouter(tags=["Dashboard"])


@router.get("/dashboard/summary")
async def dashboard_summary(
    user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start: Annotated[Optional[dt.date], Query(description="Range start (viewer's local date)")] = None,
    end: Annotated[Optional[dt.date], Query(description="Range end, inclusive")] = None,
    tz_offset: Annotated[int, Query(ge=-840, le=840, description="Minutes east of UTC")] = 0,
) -> dict[str, Any]:
    """Live KPI cards, chart series and rankings. Staff see the whole club; everyone else sees their own activity."""
    today = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=tz_offset)).date()
    end = end or today
    start = start or (end - dt.timedelta(days=364))
    return await DashboardService(db).get_summary(user, start, end, tz_offset)
