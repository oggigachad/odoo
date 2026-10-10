import csv
import datetime as dt
import io
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireOfficer, get_current_member
from app.core.database import get_db
from app.core.errors import NotFoundError, ValidationError
from app.core.helpers import format_money
from app.repositories.member_repo import MemberRepository
from app.schemas.auth import MemberInfo

router = APIRouter(tags=["Reports & Renewals"])


@router.get("/events/{event_id}/report")
async def event_report(
    event_id: int,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Attendance versus tickets sold, and what the event made: ticket revenue minus approved expenses."""
    ev = (await db.execute(text("SELECT title, starts_at FROM events WHERE event_id=:e"), {"e": event_id})).first()
    if not ev:
        raise NotFoundError("Event not found.")
    rows = (
        await db.execute(
            text(
                """
                SELECT tt.name, tt.seat_limit,
                       COUNT(t.ticket_id) AS sold,
                       COUNT(t.checked_in_at) AS attended,
                       COALESCE(SUM(t.price_paid), 0) AS revenue
                  FROM ticket_types tt
                  LEFT JOIN tickets t ON t.ticket_type_id = tt.ticket_type_id
                       AND (t.payment_id IS NOT NULL OR t.price_paid = 0)
                 WHERE tt.event_id = :e
                 GROUP BY tt.ticket_type_id, tt.name, tt.seat_limit
                 ORDER BY tt.ticket_type_id
                """
            ),
            {"e": event_id},
        )
    ).all()
    expenses = (
        await db.execute(
            text("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE event_id=:e AND status IN ('approved','reimbursed')"),
            {"e": event_id},
        )
    ).scalar_one()
    sold = sum(r[2] for r in rows)
    attended = sum(r[3] for r in rows)
    revenue = sum((Decimal(str(r[4])) for r in rows), Decimal("0"))
    return {
        "event_id": event_id,
        "title": ev[0],
        "starts_at": ev[1],
        "tickets_sold": sold,
        "attended": attended,
        "no_shows": sold - attended,
        "attendance_rate": round(attended / sold * 100, 1) if sold else 0.0,
        "ticket_revenue": format_money(revenue),
        "approved_expenses": format_money(expenses),
        "net_result": format_money(revenue - Decimal(str(expenses))),
        "by_ticket_type": [
            {"name": r[0], "seat_limit": r[1], "sold": r[2], "attended": r[3], "revenue": format_money(r[4])}
            for r in rows
        ],
    }


@router.get("/fundraisers/{fundraiser_id}/report")
async def fundraiser_report(
    fundraiser_id: int,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Raised versus goal, spending and profit for one fundraiser."""
    f = (
        await db.execute(text("SELECT title, goal_amount FROM fundraisers WHERE fundraiser_id=:f"), {"f": fundraiser_id})
    ).first()
    if not f:
        raise NotFoundError("Fundraiser not found.")
    raised = (
        await db.execute(text("SELECT COALESCE(SUM(amount),0) FROM payments WHERE fundraiser_id=:f"), {"f": fundraiser_id})
    ).scalar_one()
    spent = (
        await db.execute(
            text(
                "SELECT COALESCE(SUM(amount),0) FROM expenses "
                "WHERE fundraiser_id=:f AND status IN ('approved','reimbursed')"
            ),
            {"f": fundraiser_id},
        )
    ).scalar_one()
    goal = Decimal(str(f[1])) if f[1] is not None else None
    return {
        "fundraiser_id": fundraiser_id,
        "title": f[0],
        "goal": format_money(goal) if goal is not None else None,
        "raised": format_money(raised),
        "approved_expenses": format_money(spent),
        "profit": format_money(Decimal(str(raised)) - Decimal(str(spent))),
        "goal_progress_percent": round(float(raised) / float(goal) * 100, 1) if goal else None,
    }


@router.post("/memberships/renew", status_code=201)
async def renew_membership(
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Renew into the next semester the member does not hold yet, reusing their latest membership type.

    The new membership stays unpaid until staff record the payment, like any other membership request.
    """
    today = dt.date.today()
    repo = MemberRepository(db)
    history = await repo.get_memberships_for_member(current_user.member_id)
    if not history:
        raise ValidationError("You have no previous membership to renew. Pick a plan from the Membership tab.")
    type_id = history[0][0].membership_type_id
    held = {m.semester_id for m, _s, _t in history}
    upcoming = sorted(
        (s for s in await repo.get_semesters() if s.ends_on >= today and s.semester_id not in held),
        key=lambda s: s.starts_on,
    )
    if not upcoming:
        raise ValidationError("No upcoming semester is open for renewal yet. Ask an officer to create it.")
    ms = await repo.create_membership(current_user.member_id, upcoming[0].semester_id, type_id)
    await db.commit()
    return {
        "membership_id": ms.membership_id,
        "semester": upcoming[0].name,
        "dues_amount": format_money(ms.dues_amount),
        "status": "awaiting_payment",
    }


@router.post("/members/import")
async def import_members_csv(
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File(description="CSV with columns: full_name,email[,phone,student_id]")],
) -> dict[str, Any]:
    """One-off import of the existing sign-up spreadsheet. Existing emails are skipped, bad rows are reported."""
    raw_bytes = await file.read(2 * 1024 * 1024 + 1)
    if len(raw_bytes) > 2 * 1024 * 1024:
        raise ValidationError("CSV is larger than 2 MB.")
    reader = csv.DictReader(io.StringIO(raw_bytes.decode("utf-8-sig", errors="replace")))
    if not reader.fieldnames or not {"full_name", "email"} <= {h.strip().lower() for h in reader.fieldnames}:
        raise ValidationError("CSV needs at least the columns full_name and email.")
    repo = MemberRepository(db)
    created, skipped, errors = 0, 0, []
    for line, row in enumerate(reader, start=2):
        r = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        name, email = r.get("full_name", ""), r.get("email", "").lower()
        if not name or "@" not in email:
            errors.append({"line": line, "error": "missing name or valid email"})
            continue
        if await repo.get_by_email(email):
            skipped += 1
            continue
        member = await repo.create(name, email, r.get("phone") or None)
        member.student_id = r.get("student_id") or None
        created += 1
    await db.commit()
    return {"created": created, "skipped_existing": skipped, "errors": errors[:50]}
