import datetime
import logging
import urllib.parse

from sqlalchemy import and_, exists, select, text

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.redis import enqueue_email
from app.models.schema_models import Member, Membership, Semester
from app.services.notification_service import announce_notifications, notify

logger = logging.getLogger(__name__)


def google_calendar_link(title: str, day: datetime.date, details: str) -> str:
    """'Add to Google Calendar' link for an all-day event."""
    end = day + datetime.timedelta(days=1)
    q = urllib.parse.urlencode(
        {"action": "TEMPLATE", "text": title, "dates": f"{day:%Y%m%d}/{end:%Y%m%d}", "details": details}
    )
    return f"https://calendar.google.com/calendar/render?{q}"


async def send_renewal_reminders(today: datetime.date | None = None) -> dict[str, int]:
    """Daily sweep, members only.

    * Paid members get an in-app notification and an email 30 and 7 days before their semester ends
      (unless they already renewed). The email carries an 'Add to Google Calendar' link for the end date.
    * Ticket holders get a reminder the day before an event.

    Membership status is derived from semester dates, so a lapsed membership expires on its own.
    Notification rows are deduplicated, and the 7-day email fires only if the 30-day stamp is old enough.
    """
    today = today or datetime.date.today()
    sent = 0
    event_reminders = 0
    async with async_session_factory() as session:
        later = Membership.__table__.alias("later")
        later_sem = Semester.__table__.alias("later_sem")
        renewed = exists().where(
            and_(
                later.c.member_id == Membership.member_id,
                later.c.payment_id.is_not(None),
                later.c.semester_id == later_sem.c.semester_id,
                later_sem.c.ends_on > Semester.ends_on,
            )
        )
        rows = await session.execute(
            select(Membership, Semester, Member)
            .join(Semester, Semester.semester_id == Membership.semester_id)
            .join(Member, Member.member_id == Membership.member_id)
            .where(
                Membership.payment_id.is_not(None),
                Semester.ends_on >= today,
                Semester.ends_on <= today + datetime.timedelta(days=30),
                ~renewed,
            )
        )
        for ms, sem, member in rows.all():
            days_left = (sem.ends_on - today).days
            stamp = ms.renewal_reminder_sent_at
            due_30 = stamp is None
            due_7 = days_left <= 7 and stamp is not None and stamp.date() <= sem.ends_on - datetime.timedelta(days=10)
            if not (due_30 or due_7):
                continue
            cal = google_calendar_link(
                f"Skyline membership ends ({sem.name})",
                sem.ends_on,
                "Renew from the Membership tab at " + settings.FRONTEND_URL,
            )
            await notify(
                session, [member.member_id], "renewal",
                f"Membership ends in {days_left} day{'s' if days_left != 1 else ''}",
                f"Your {sem.name} membership ends on {sem.ends_on:%d %b %Y}. Renew to keep your member discounts.",
                "#dashboard", f"renewal:{ms.membership_id}:{'7' if days_left <= 7 else '30'}",
            )
            await enqueue_email(
                {
                    "type": "renewal_reminder", "to": member.email, "name": member.full_name, "days_left": days_left,
                    "valid_until": sem.ends_on.isoformat(), "calendar_link": cal,
                }
            )
            ms.renewal_reminder_sent_at = datetime.datetime.now(datetime.timezone.utc)
            sent += 1

        # Event-day-before reminders for people holding a valid ticket
        tickets = await session.execute(
            text(
                """
                SELECT t.ticket_id, m.member_id, m.email, e.title, e.starts_at, e.venue
                  FROM tickets t JOIN ticket_types tt ON tt.ticket_type_id=t.ticket_type_id JOIN events e ON e.event_id=tt.event_id
                  JOIN members m ON m.member_id=t.member_id OR LOWER(m.email)=LOWER(t.holder_email)
                 WHERE (t.payment_id IS NOT NULL OR t.price_paid=0) AND t.checked_in_at IS NULL
                   AND e.starts_at::date = :d
                """
            ),
            {"d": today + datetime.timedelta(days=1)},
        )
        for tid, mid, email, title, starts, venue in tickets.all():
            created = await notify(
                session, [mid], "event", f"Tomorrow: {title}",
                f"{starts:%a %d %b, %I:%M %p}{' at ' + venue if venue else ''}. Have your ticket QR ready.",
                "#dashboard", f"event:{tid}",
            )
            if created:
                event_reminders += 1
                await enqueue_email(
                    {"type": "event_reminder", "to": email, "title": title, "when": f"{starts:%a %d %b, %I:%M %p}", "venue": venue or ""}
                )
        await session.commit()
    if sent or event_reminders:
        logger.info("Queued %d renewal and %d event reminders", sent, event_reminders)
        await announce_notifications()
    return {"reminders_queued": sent, "event_reminders": event_reminders}
