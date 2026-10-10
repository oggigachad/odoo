import datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.database import async_session_factory
from app.core.redis import get_redis_client
from app.core.security import create_session_token
from app.jobs.membership_reminders import send_renewal_reminders
from app.main import app
from app.models.schema_models import LeadershipRole, Member, Membership, MembershipType, Payment, Semester


async def _member(role: str | None = None) -> tuple[int, dict[str, str]]:
    uid = uuid.uuid4().hex[:8]
    async with async_session_factory() as db:
        m = Member(full_name=f"R {uid}", email=f"r_{uid}@skyline.edu")
        db.add(m)
        await db.flush()
        if role:
            db.add(LeadershipRole(member_id=m.member_id, position=role, term_year=datetime.date.today().year))
        await db.commit()
        return m.member_id, {"Authorization": f"Bearer {create_session_token(m.member_id)}"}


@pytest.mark.asyncio
async def test_renewal_reminders_and_renew_endpoint() -> None:
    import random

    uid = uuid.uuid4().hex[:6]
    year = random.randint(3000, 8000)  # far future so it never overlaps other semesters
    today = datetime.date(year, 12, 15)
    mid, headers = await _member()
    async with async_session_factory() as db:
        cur = Semester(name=f"Cur {uid}", starts_on=datetime.date(year, 8, 1), ends_on=datetime.date(year, 12, 31))
        nxt = Semester(name=f"Nxt {uid}", starts_on=datetime.date(year + 1, 1, 1), ends_on=datetime.date(year + 1, 5, 31))
        mt = MembershipType(name=f"T {uid}", dues_amount=100)
        db.add_all([cur, nxt, mt])
        await db.flush()
        pay = Payment(member_id=mid, category="dues", amount=100, method="cash")
        db.add(pay)
        await db.flush()
        db.add(Membership(member_id=mid, semester_id=cur.semester_id, membership_type_id=mt.membership_type_id, dues_amount=100, payment_id=pay.payment_id))
        await db.commit()

    await get_redis_client().delete("oddo:v1:queue:emails")
    assert (await send_renewal_reminders(today))["reminders_queued"] >= 1
    assert (await send_renewal_reminders(today))["reminders_queued"] == 0  # not sent twice

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/memberships/renew", headers=headers)
        assert res.status_code == 201, res.text
        assert res.json()["status"] == "awaiting_payment"
        # renewing again moves on to the following semester, never duplicates one already held
        again = await client.post("/api/v1/memberships/renew", headers=headers)
        assert again.status_code in (201, 422)


@pytest.mark.asyncio
async def test_event_report_and_csv_import() -> None:
    _, officer = await _member("Officer")
    _, guest = await _member()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        ev = (
            await client.post(
                "/api/v1/events",
                headers=officer,
                json={
                    "title": "Report Night",
                    "starts_at": (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=2)).isoformat(),
                    "ticket_types": [{"name": "Free", "member_price": "0.00", "non_member_price": "0.00", "seat_limit": 5, "non_member_seat_limit": 5}],
                },
            )
        ).json()
        tt = ev["ticket_types"][0]["ticket_type_id"]
        buy = await client.post(
            "/api/v1/tickets/purchase",
            json={"ticket_type_id": tt, "holders": [{"holder_name": "A"}, {"holder_name": "B"}]},
        )
        code = buy.json()["tickets"][0]["ticket_code"]
        await client.post("/api/v1/checkin", headers=officer, json={"ticket_code": code, "event_id": ev["event_id"]})

        rep = (await client.get(f"/api/v1/events/{ev['event_id']}/report", headers=officer)).json()
        assert rep["tickets_sold"] == 2 and rep["attended"] == 1 and rep["no_shows"] == 1
        assert rep["attendance_rate"] == 50.0 and rep["net_result"] == "0.00"
        assert (await client.get(f"/api/v1/events/{ev['event_id']}/report", headers=guest)).status_code == 403

        uid = uuid.uuid4().hex[:6]
        csv_body = f"full_name,email,phone,student_id\nAmit,amit_{uid}@x.edu,999,1NT23CS001\nBad,notanemail,,\nAmit Dup,amit_{uid}@x.edu,,\n"
        imp = await client.post("/api/v1/members/import", headers=officer, files={"file": ("m.csv", csv_body, "text/csv")})
        assert imp.status_code == 200, imp.text
        body = imp.json()
        assert body["created"] == 1 and body["skipped_existing"] == 1 and len(body["errors"]) == 1
        assert (await client.post("/api/v1/members/import", headers=guest, files={"file": ("m.csv", csv_body, "text/csv")})).status_code == 403
