"""In-app notifications. Rows are deduplicated by (member, kind, ref) so jobs can safely re-run."""

from typing import Iterable, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.realtime import publish_event


async def notify(
    session: AsyncSession,
    member_ids: Iterable[int],
    kind: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    ref: Optional[str] = None,
) -> int:
    """Insert one notification per member. Caller commits; call `announce_notifications` after the commit."""
    created = 0
    for mid in set(member_ids):
        res = await session.execute(
            text(
                "INSERT INTO notifications (member_id, kind, title, body, link, ref) "
                "VALUES (:m, :k, :t, :b, :l, :r) ON CONFLICT DO NOTHING"
            ),
            {"m": mid, "k": kind, "t": title, "b": body, "l": link, "r": ref},
        )
        created += res.rowcount or 0
    return created


async def announce_notifications() -> None:
    """Tell connected clients to refetch their notifications (the bell and OS notifications react to this)."""
    await publish_event("data_changed", {"topic": "notifications"})
