from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.schema_models import Announcement


class AnnouncementRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, title: str, body: str, posted_by: int) -> Announcement:
        ann = Announcement(
            title=title.strip(),
            body=body.strip(),
            posted_by=posted_by,
        )
        self.session.add(ann)
        await self.session.flush()
        loaded = await self.get_by_id(ann.announcement_id)
        return loaded or ann

    async def list(self) -> Sequence[Announcement]:
        result = await self.session.execute(
            select(Announcement).options(selectinload(Announcement.author)).order_by(Announcement.posted_at.desc())
        )
        return result.scalars().all()

    async def get_by_id(self, announcement_id: int) -> Optional[Announcement]:
        stmt = (
            select(Announcement)
            .options(selectinload(Announcement.author))
            .where(Announcement.announcement_id == announcement_id)
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()
