import datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import async_session_factory
from app.core.security import create_session_token
from app.main import app
from app.models.schema_models import LeadershipRole, Member


@pytest.mark.asyncio
async def test_fundraisers_and_tasks_flow() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        uid = uuid.uuid4().hex[:6]
        # Create officer and volunteer member
        async with async_session_factory() as db:
            officer = Member(
                full_name=f"President {uid}",
                email=f"pres_{uid}@skyline.edu",
                joined_on=datetime.date.today(),
            )
            volunteer = Member(
                full_name=f"Volunteer {uid}",
                email=f"vol_{uid}@skyline.edu",
                joined_on=datetime.date.today(),
            )
            db.add_all([officer, volunteer])
            await db.flush()
            role = LeadershipRole(
                member_id=officer.member_id,
                position="President",
                term_year=datetime.date.today().year,
            )
            db.add(role)
            await db.commit()
            officer_id = officer.member_id
            volunteer_id = volunteer.member_id

        officer_token = create_session_token(officer_id)
        officer_headers = {"Authorization": f"Bearer {officer_token}"}
        volunteer_token = create_session_token(volunteer_id)
        volunteer_headers = {"Authorization": f"Bearer {volunteer_token}"}

        # 1. Officer creates fundraiser
        f_res = await client.post(
            "/api/v1/fundraisers",
            headers=officer_headers,
            json={
                "title": f"Library Renovation {uid}",
                "description": "Upgrading study rooms",
                "goal_amount": "50000.00",
            },
        )
        assert f_res.status_code == 201
        f_id = f_res.json()["fundraiser_id"]

        # 2. Officer creates task assigned to volunteer
        t_res = await client.post(
            f"/api/v1/fundraisers/{f_id}/tasks",
            headers=officer_headers,
            json={
                "title": "Paint room 101",
                "assigned_to": volunteer_id,
            },
        )
        assert t_res.status_code == 201
        t_id = t_res.json()["task_id"]

        # 3. Volunteer updates task status to in_progress
        patch_res = await client.patch(
            f"/api/v1/fundraisers/{f_id}/tasks/{t_id}",
            headers=volunteer_headers,
            json={"status": "in_progress"},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == "in_progress"

        # 4. Check progress
        prog_res = await client.get(f"/api/v1/fundraisers/{f_id}/progress")
        assert prog_res.status_code == 200
        assert prog_res.json()["tasks_total"] == 1
        assert prog_res.json()["tasks_done"] == 0

        # 5. Volunteer completes task
        done_res = await client.patch(
            f"/api/v1/fundraisers/{f_id}/tasks/{t_id}",
            headers=volunteer_headers,
            json={"status": "done"},
        )
        assert done_res.status_code == 200

        # Check progress again
        prog_res2 = await client.get(f"/api/v1/fundraisers/{f_id}/progress")
        assert prog_res2.status_code == 200
        assert prog_res2.json()["tasks_done"] == 1
