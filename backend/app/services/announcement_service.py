from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.redis import enqueue_email
from app.repositories.announcement_repo import AnnouncementRepository
from app.schemas.announcements import AnnouncementCreate, AnnouncementResponse


class AnnouncementService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = AnnouncementRepository(session)

    async def create_announcement(self, data: AnnouncementCreate, posted_by: int) -> AnnouncementResponse:
        ann = await self.repo.create(data.title, data.body, posted_by)
        await self.session.commit()

        # Enqueue broadcast email job to queue:emails
        await enqueue_email(
            {
                "type": "announcement_broadcast",
                "announcement_id": ann.announcement_id,
                "title": ann.title,
                "body": ann.body,
            }
        )

        author_name = ann.author.full_name if ("author" in ann.__dict__ and ann.author) else None
        return AnnouncementResponse(
            announcement_id=ann.announcement_id,
            title=ann.title,
            body=ann.body,
            posted_by=ann.posted_by,
            author_name=author_name,
            posted_at=ann.posted_at,
        )

    async def list_announcements(self) -> list[AnnouncementResponse]:
        items = await self.repo.list()
        return [
            AnnouncementResponse(
                announcement_id=a.announcement_id,
                title=a.title,
                body=a.body,
                posted_by=a.posted_by,
                author_name=a.author.full_name if ("author" in a.__dict__ and a.author) else None,
                posted_at=a.posted_at,
            )
            for a in items
        ]

    async def get_by_id(self, announcement_id: int) -> AnnouncementResponse:
        ann = await self.repo.get_by_id(announcement_id)
        if not ann:
            raise NotFoundError("Announcement not found.")
        author_name = ann.author.full_name if ("author" in ann.__dict__ and ann.author) else None
        return AnnouncementResponse(
            announcement_id=ann.announcement_id,
            title=ann.title,
            body=ann.body,
            posted_by=ann.posted_by,
            author_name=author_name,
            posted_at=ann.posted_at,
        )
