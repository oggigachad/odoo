from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireAnnouncer
from app.core.database import get_db
from app.schemas.announcements import AnnouncementCreate, AnnouncementResponse
from app.schemas.auth import MemberInfo
from app.services.announcement_service import AnnouncementService

router = APIRouter(tags=["Announcements"])


@router.get("/announcements", response_model=list[AnnouncementResponse])
async def list_announcements(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AnnouncementResponse]:
    """Public list of club announcements."""
    service = AnnouncementService(db)
    return await service.list_announcements()


@router.get("/announcements/{announcement_id}", response_model=AnnouncementResponse)
async def get_announcement(
    announcement_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnnouncementResponse:
    """Get single announcement details."""
    service = AnnouncementService(db)
    return await service.get_by_id(announcement_id)


@router.post("/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    payload: AnnouncementCreate,
    current_officer: Annotated[MemberInfo, Depends(RequireAnnouncer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnnouncementResponse:
    """Officer creates an announcement and broadcasts emails to members."""
    service = AnnouncementService(db)
    return await service.create_announcement(payload, current_officer.member_id)
