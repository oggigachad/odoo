import datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import async_session_factory
from app.core.security import create_session_token
from app.main import app
from app.models.schema_models import LeadershipRole


@pytest.mark.asyncio
async def test_tickets_non_member_limit_and_checkin() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        uid = uuid.uuid4().hex[:6]
        # 1. Create officer
        res = await client.post(
            "/api/v1/members",
            json={"full_name": f"Officer {uid}", "email": f"officer_{uid}@skyline.edu"},
        )
        officer_id = res.json()["member_id"]
        async with async_session_factory() as db:
            role = LeadershipRole(member_id=officer_id, position="Officer", term_year=datetime.date.today().year)
            db.add(role)
            await db.commit()

        officer_token = create_session_token(officer_id)
        auth_headers = {"Authorization": f"Bearer {officer_token}"}

        # 2. Create Event with total 5 seats, 2 non-member seats
        event_res = await client.post(
            "/api/v1/events",
            headers=auth_headers,
            json={
                "title": f"Spring Gala {uid}",
                "venue": "Campus Hall",
                "starts_at": "2026-11-20T18:00:00Z",
                "ticket_types": [
                    {
                        "name": "General",
                        "member_price": "0.00",  # Free for members
                        "non_member_price": "100.00",
                        "seat_limit": 5,
                        "non_member_seat_limit": 2,
                    }
                ],
            },
        )
        assert event_res.status_code == 201
        event_data = event_res.json()
        tt_id = event_data["ticket_types"][0]["ticket_type_id"]

        # 3. Non-member buys 2 tickets (hits non-member limit of 2)
        purchase_res = await client.post(
            "/api/v1/tickets/purchase",
            json={
                "ticket_type_id": tt_id,
                "holders": [
                    {"holder_name": "Non Member 1", "holder_email": "guest1@example.com"},
                    {"holder_name": "Non Member 2", "holder_email": "guest2@example.com"},
                ],
            },
        )
        assert purchase_res.status_code == 201
        t_data = purchase_res.json()
        assert len(t_data["tickets"]) == 2
        assert t_data["total_amount"] == "200.00"

        # 4. Another non-member attempts to buy 1 ticket -> Should fail with SOLD_OUT_NON_MEMBER (409)
        excess_nm_res = await client.post(
            "/api/v1/tickets/purchase",
            json={
                "ticket_type_id": tt_id,
                "holders": [{"holder_name": "Guest 3", "holder_email": "guest3@example.com"}],
            },
        )
        assert excess_nm_res.status_code == 409
        assert excess_nm_res.json()["error"]["code"] == "SOLD_OUT_NON_MEMBER"

        # 5. Door Check-In:
        # Since these tickets were unpaid (price_paid = 100.00, payment_id is None),
        # check-in should fail with TICKET_UNPAID
        ticket_code = t_data["tickets"][0]["ticket_code"]
        checkin_res = await client.post(
            "/api/v1/checkin",
            headers=auth_headers,
            json={"ticket_code": ticket_code, "event_id": event_data["event_id"]},
        )
        assert checkin_res.status_code == 409
        assert checkin_res.json()["error"]["code"] == "TICKET_UNPAID"

        # 6. Simulate payment webhook to mark the tickets paid
        webhook_res = await client.post(
            "/api/v1/webhooks/payment",
            json={
                "external_ref": f"pay_tix_{uid}",
                "category": "ticket",
                "amount": "200.00",
                "ticket_ids": [t_data["tickets"][0]["ticket_id"], t_data["tickets"][1]["ticket_id"]],
            },
        )
        assert webhook_res.status_code == 200

        # Now check-in should succeed!
        checkin_success = await client.post(
            "/api/v1/checkin",
            headers=auth_headers,
            json={"ticket_code": ticket_code, "event_id": event_data["event_id"]},
        )
        assert checkin_success.status_code == 200
        assert checkin_success.json()["status"] == "ADMITTED"

        # Duplicate scan should fail with TICKET_ALREADY_CHECKED_IN (409)
        dup_scan = await client.post(
            "/api/v1/checkin",
            headers=auth_headers,
            json={"ticket_code": ticket_code, "event_id": event_data["event_id"]},
        )
        assert dup_scan.status_code == 409
        assert dup_scan.json()["error"]["code"] == "TICKET_ALREADY_CHECKED_IN"
