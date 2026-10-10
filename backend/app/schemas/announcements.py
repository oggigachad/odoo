import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    body: str = Field(..., min_length=1)
    send_email: bool = True


class AnnouncementResponse(BaseModel):
    announcement_id: int
    title: str
    body: str
    posted_by: int
    author_name: Optional[str] = None
    posted_at: datetime.datetime
    # Only set on create: queued | skipped_smtp_unconfigured | skipped_queue_unavailable
    email_status: Optional[str] = None
