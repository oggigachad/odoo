from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ASSIGNABLE_POSITIONS, RequireAdmin
from app.core.database import get_db
from app.jobs.membership_reminders import send_renewal_reminders
from app.schemas.auth import MemberInfo
from app.services.auth_service import AuthService

router = APIRouter(tags=["Admin"])


@router.get("/admin/users")
async def list_users(
    _: Annotated[MemberInfo, Depends(RequireAdmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Annotated[Optional[str], Query(description="Search name, email or student id")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    """Everything the admin needs to know about every user: roles, membership, student id, activity."""
    like = f"%{(q or '').strip().lower()}%"
    rows = (
        await db.execute(
            text(
                """
                SELECT m.member_id, m.full_name, m.email, m.phone, m.student_id, m.joined_on,
                       COALESCE((SELECT array_agg(DISTINCT l.position) FROM leadership_roles l
                                  WHERE l.member_id=m.member_id AND l.term_year = EXTRACT(YEAR FROM CURRENT_DATE)), '{}') AS roles,
                       (SELECT MAX(s.ends_on) FROM memberships ms JOIN semesters s ON s.semester_id=ms.semester_id
                         WHERE ms.member_id=m.member_id AND ms.payment_id IS NOT NULL) AS member_until,
                       EXISTS (SELECT 1 FROM memberships ms JOIN semesters s ON s.semester_id=ms.semester_id
                                WHERE ms.member_id=m.member_id AND ms.payment_id IS NOT NULL
                                  AND CURRENT_DATE BETWEEN s.starts_on AND s.ends_on) AS is_member,
                       m.password_hash IS NOT NULL AS has_password,
                       (SELECT COUNT(*) FROM tickets t WHERE t.member_id=m.member_id OR LOWER(t.holder_email)=LOWER(m.email)) AS tickets,
                       (SELECT COUNT(*) FROM orders o WHERE o.member_id=m.member_id OR LOWER(o.buyer_email)=LOWER(m.email)) AS orders,
                       (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.member_id=m.member_id) AS paid_total,
                       COUNT(*) OVER () AS total
                  FROM members m
                 WHERE (:q = '%%' OR LOWER(m.full_name) LIKE :q OR LOWER(m.email) LIKE :q OR LOWER(COALESCE(m.student_id,'')) LIKE :q)
                 ORDER BY m.member_id LIMIT :lim OFFSET :off
                """
            ),
            {"q": like, "lim": limit, "off": offset},
        )
    ).all()
    items = []
    for r in rows:
        roles = list(r[6])
        items.append(
            {
                "member_id": r[0], "full_name": r[1], "email": r[2], "phone": r[3], "student_id": r[4], "joined_on": str(r[5]),
                "positions": roles, "access_level": AuthService.resolve_access_level(roles, bool(r[8])),
                "member_until": str(r[7]) if r[7] else None, "is_member": bool(r[8]), "has_password": bool(r[9]),
                "tickets": int(r[10]), "orders": int(r[11]), "paid_total": float(r[12]),
            }
        )
    return {"items": items, "total": int(rows[0][13]) if rows else 0, "assignable_positions": list(ASSIGNABLE_POSITIONS)}


@router.post("/admin/run-reminders")
async def run_reminders_now(_: Annotated[MemberInfo, Depends(RequireAdmin)]) -> dict[str, int]:
    """Run the renewal + event reminder sweep immediately (it also runs every day on its own)."""
    return await send_renewal_reminders()
