import datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_session_token
from app.main import app
from app.models.schema_models import LeadershipRole


@pytest.fixture
async def officer_client() -> AsyncClient:
    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    return client


@pytest.mark.asyncio
async def test_semester_and_membership_types_flow() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Create officer
        uid = uuid.uuid4().hex[:6]
        res = await client.post(
            "/api/v1/members",
            json={"full_name": f"Officer {uid}", "email": f"officer_{uid}@skyline.edu"},
        )
        assert res.status_code == 201
        officer_data = res.json()
        officer_id = officer_data["member_id"]

        # Insert leadership role for current year directly using session token
        from app.core.database import async_session_factory

        async with async_session_factory() as db:
            role = LeadershipRole(member_id=officer_id, position="President", term_year=datetime.date.today().year)
            db.add(role)
            await db.commit()

        token = create_session_token(officer_id)
        auth_headers = {"Authorization": f"Bearer {token}"}

        # 2. Officer creates semester (in a year no earlier run has used: the test database keeps old semesters)
        from sqlalchemy import text as _text

        async with async_session_factory() as db:
            used = {r[0] for r in (await db.execute(_text(
                "SELECT DISTINCT y FROM (SELECT generate_series(extract(year FROM starts_on)::int, extract(year FROM ends_on)::int + 1) AS y FROM semesters) s"
            ))).all()}
        year = next(y for y in range(2050 + (int(uid, 16) % 500), 9000) if y not in used and y + 1 not in used)
        sem_res = await client.post(
            "/api/v1/semesters",
            headers=auth_headers,
            json={
                "name": f"Fall {year} {uid}",
                "starts_on": f"{year}-08-01",
                "ends_on": f"{year}-12-15",
            },
        )
        assert sem_res.status_code == 201
        sem_data = sem_res.json()
        assert sem_data["name"] == f"Fall {year} {uid}"

        # 3. Overlapping semester date range should fail with SEMESTER_OVERLAP (409)
        overlap_res = await client.post(
            "/api/v1/semesters",
            headers=auth_headers,
            json={
                "name": f"Overlap Semester {uid}",
                "starts_on": f"{year}-10-01",
                "ends_on": f"{year + 1}-01-15",
            },
        )
        assert overlap_res.status_code == 409
        assert overlap_res.json()["error"]["code"] == "SEMESTER_OVERLAP"

        # 4. Officer creates membership types (Basic, Plus)
        mt_res = await client.post(
            "/api/v1/membership-types",
            headers=auth_headers,
            json={"name": f"Basic {uid}", "dues_amount": "500.00", "is_offered": True},
        )
        assert mt_res.status_code == 201
        basic_type = mt_res.json()

        # 5. Member buys membership for semester
        student_res = await client.post(
            "/api/v1/members",
            json={"full_name": f"Student {uid}", "email": f"student_{uid}@skyline.edu"},
        )
        student_id = student_res.json()["member_id"]
        student_token = create_session_token(student_id)

        ms_res = await client.post(
            "/api/v1/memberships",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "member_id": student_id,
                "semester_id": sem_data["semester_id"],
                "membership_type_id": basic_type["membership_type_id"],
            },
        )
        assert ms_res.status_code == 201
        ms_data = ms_res.json()
        assert ms_data["dues_amount"] == "500.00"
        assert ms_data["semester_name"] == f"Fall {year} {uid}"

        # 6a. An unpaid attempt (cancelled payment) is reused on retry instead of being refused
        retry = await client.post(
            "/api/v1/memberships",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"member_id": student_id, "semester_id": sem_data["semester_id"], "membership_type_id": basic_type["membership_type_id"]},
        )
        assert retry.status_code == 201 and retry.json()["membership_id"] == ms_data["membership_id"]

        # 6b. Once paid, buying the same semester again fails with MEMBERSHIP_EXISTS (409)
        from sqlalchemy import text as _t

        from app.core.database import async_session_factory as _sf

        async with _sf() as _db:
            pid = (await _db.execute(_t("INSERT INTO payments (category, amount, method, member_id) VALUES ('dues', 500, 'cash', :m) RETURNING payment_id"), {"m": student_id})).scalar_one()
            await _db.execute(_t("UPDATE memberships SET payment_id = :p WHERE membership_id = :i"), {"p": pid, "i": ms_data["membership_id"]})
            await _db.commit()
        dup_ms_res = await client.post(
            "/api/v1/memberships",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "member_id": student_id,
                "semester_id": sem_data["semester_id"],
                "membership_type_id": basic_type["membership_type_id"],
            },
        )
        assert dup_ms_res.status_code == 409
        assert dup_ms_res.json()["error"]["code"] == "MEMBERSHIP_EXISTS"
