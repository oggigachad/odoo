import datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import async_session_factory
from app.core.security import create_session_token
from app.main import app
from app.models.schema_models import LeadershipRole, Member


@pytest.mark.asyncio
async def test_announcements_flow() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        uid = uuid.uuid4().hex[:6]
        # Create officer
        async with async_session_factory() as db:
            officer = Member(
                full_name=f"Secretary {uid}",
                email=f"secretary_{uid}@skyline.edu",
                joined_on=datetime.date.today(),
            )
            db.add(officer)
            await db.flush()
            role = LeadershipRole(
                member_id=officer.member_id,
                position="Secretary",
                term_year=datetime.date.today().year,
            )
            db.add(role)
            await db.commit()
            officer_id = officer.member_id

        token = create_session_token(officer_id)
        auth_headers = {"Authorization": f"Bearer {token}"}

        # 1. Post announcement
        post_res = await client.post(
            "/api/v1/announcements",
            headers=auth_headers,
            json={
                "title": f"Spring General Meeting {uid}",
                "body": "Welcome all members to the hall.",
            },
        )
        assert post_res.status_code == 201
        ann_id = post_res.json()["announcement_id"]

        # 2. Get announcement by ID
        get_res = await client.get(f"/api/v1/announcements/{ann_id}")
        assert get_res.status_code == 200
        assert get_res.json()["title"] == f"Spring General Meeting {uid}"

        # 3. List announcements
        list_res = await client.get("/api/v1/announcements?limit=10")
        assert list_res.status_code == 200
        assert any(a["announcement_id"] == ann_id for a in list_res.json())
