import datetime as dt
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_member
from app.core.database import get_db
from app.core.errors import ForbiddenError, NotFoundError
from app.schemas.auth import MemberInfo

router = APIRouter(tags=["Notifications"])


class MarkRead(BaseModel):
    ids: Optional[list[int]] = None  # None = everything


@router.get("/notifications")
async def my_notifications(
    user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    rows = (
        await db.execute(
            text(
                "SELECT notification_id, kind, title, body, link, created_at, read_at FROM notifications "
                "WHERE member_id=:m ORDER BY created_at DESC, notification_id DESC LIMIT 30"
            ),
            {"m": user.member_id},
        )
    ).all()
    unread = (
        await db.execute(text("SELECT COUNT(*) FROM notifications WHERE member_id=:m AND read_at IS NULL"), {"m": user.member_id})
    ).scalar_one()
    return {
        "unread": int(unread),
        "items": [
            {"id": r[0], "kind": r[1], "title": r[2], "body": r[3], "link": r[4], "created_at": r[5], "read": r[6] is not None}
            for r in rows
        ],
    }


@router.post("/notifications/read")
async def mark_read(
    payload: MarkRead,
    user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    if payload.ids:
        await db.execute(
            text("UPDATE notifications SET read_at=NOW() WHERE member_id=:m AND read_at IS NULL AND notification_id = ANY(:ids)"),
            {"m": user.member_id, "ids": payload.ids},
        )
    else:
        await db.execute(text("UPDATE notifications SET read_at=NOW() WHERE member_id=:m AND read_at IS NULL"), {"m": user.member_id})
    await db.commit()
    return {"status": "ok"}


@router.get("/memberships/{membership_id}/calendar.ics")
async def membership_calendar(
    membership_id: int,
    user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Calendar file (Google Calendar, Apple, Outlook) with a renewal reminder 30 and 7 days before the semester ends."""
    row = (
        await db.execute(
            text(
                "SELECT ms.member_id, s.ends_on, s.name FROM memberships ms JOIN semesters s ON s.semester_id=ms.semester_id "
                "WHERE ms.membership_id=:i"
            ),
            {"i": membership_id},
        )
    ).first()
    if not row:
        raise NotFoundError("Membership not found.")
    if row[0] != user.member_id:
        raise ForbiddenError("You can only export your own membership.")
    ends: dt.date = row[1]
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    nxt = (ends + dt.timedelta(days=1)).strftime("%Y%m%d")
    ics = "\r\n".join(
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Skyline Student Association//Membership//EN",
            "BEGIN:VEVENT",
            f"UID:membership-{membership_id}@skyline",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{ends.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{nxt}",
            f"SUMMARY:Skyline membership ends ({row[2]}) - renew",
            "DESCRIPTION:Renew from the Membership tab to keep member pricing.",
            "BEGIN:VALARM", "TRIGGER:-P30D", "ACTION:DISPLAY", "DESCRIPTION:Membership ends in 30 days", "END:VALARM",
            "BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", "DESCRIPTION:Membership ends in 7 days", "END:VALARM",
            "END:VEVENT",
            "END:VCALENDAR",
            "",
        ]
    )
    return Response(content=ics, media_type="text/calendar", headers={"Content-Disposition": 'attachment; filename="skyline-renewal.ics"'})
