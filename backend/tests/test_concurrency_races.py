import asyncio
import datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import async_session_factory
from app.core.security import create_session_token
from app.main import app
from app.models.schema_models import LeadershipRole


@pytest.mark.asyncio
async def test_race_condition_zero_oversell() -> None:
    """
    Race test (T-09, D-008):
    20 concurrent buyers attempt to reserve 1 ticket each for an event with only 5 total seats.
    Verifies that exactly 5 succeed and exactly 15 receive SOLD_OUT (409).
    Zero oversell guarantee under concurrent traffic.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        uid = uuid.uuid4().hex[:6]
        # Create officer and event
        res = await client.post(
            "/api/v1/members",
            json={"full_name": f"Officer {uid}", "email": f"officer_{uid}@skyline.edu"},
        )
        officer_id = res.json()["member_id"]
        async with async_session_factory() as db:
            role = LeadershipRole(member_id=officer_id, position="Officer", term_year=datetime.date.today().year)
            db.add(role)
            await db.commit()

        token = create_session_token(officer_id)
        auth_headers = {"Authorization": f"Bearer {token}"}

        event_res = await client.post(
            "/api/v1/events",
            headers=auth_headers,
            json={
                "title": f"Race Gala {uid}",
                "venue": "Hall",
                "starts_at": "2026-12-31T20:00:00Z",
                "ticket_types": [
                    {
                        "name": "General",
                        "member_price": "50.00",
                        "non_member_price": "100.00",
                        "seat_limit": 5,
                        "non_member_seat_limit": 5,
                    }
                ],
            },
        )
        assert event_res.status_code == 201
        tt_id = event_res.json()["ticket_types"][0]["ticket_type_id"]

    # 20 concurrent requests
    async def try_buy(index: int) -> int:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(
                "/api/v1/tickets/purchase",
                json={
                    "ticket_type_id": tt_id,
                    "holders": [{"holder_name": f"Buyer {index}", "holder_email": f"buyer_{index}_{uid}@test.com"}],
                },
            )
            return r.status_code

    results = await asyncio.gather(*(try_buy(i) for i in range(20)))

    success_count = results.count(201)
    sold_out_count = results.count(409)

    assert success_count == 5, f"Expected exactly 5 successful purchases, got {success_count}"
    assert sold_out_count == 15, f"Expected exactly 15 sold out responses, got {sold_out_count}"
