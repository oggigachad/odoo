import datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import async_session_factory
from app.core.security import create_session_token
from app.main import app
from app.models.schema_models import LeadershipRole


@pytest.mark.asyncio
async def test_finance_treasurer_and_expense_lifecycle() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        uid = uuid.uuid4().hex[:6]
        # 1. Create volunteer, officer 1 (Treasurer), and officer 2 (President)
        vol_res = await client.post(
            "/api/v1/members",
            json={"full_name": f"Volunteer {uid}", "email": f"volunteer_{uid}@skyline.edu"},
        )
        vol_id = vol_res.json()["member_id"]
        vol_token = create_session_token(vol_id)

        treasurer_res = await client.post(
            "/api/v1/members",
            json={"full_name": f"Treasurer {uid}", "email": f"treasurer_{uid}@skyline.edu"},
        )
        treasurer_id = treasurer_res.json()["member_id"]

        president_res = await client.post(
            "/api/v1/members",
            json={"full_name": f"President {uid}", "email": f"president_{uid}@skyline.edu"},
        )
        president_id = president_res.json()["member_id"]

        curr_year = datetime.date.today().year
        async with async_session_factory() as db:
            db.add(LeadershipRole(member_id=treasurer_id, position="Treasurer", term_year=curr_year))
            db.add(LeadershipRole(member_id=president_id, position="President", term_year=curr_year))
            await db.commit()

        treasurer_token = create_session_token(treasurer_id)
        president_token = create_session_token(president_id)

        # 2. Record income: Treasurer records cash dues
        pay_res = await client.post(
            "/api/v1/payments/cash",
            headers={"Authorization": f"Bearer {treasurer_token}"},
            json={
                "category": "dues",
                "amount": "500.00",
                "member_id": vol_id,
            },
        )
        assert pay_res.status_code == 201
        assert pay_res.json()["amount"] == "500.00"

        # 3. Webhook idempotency test (D-020):
        # First call processes
        wh1 = await client.post(
            "/api/v1/webhooks/payment",
            json={
                "external_ref": f"ext_pay_{uid}",
                "category": "dues",
                "amount": "500.00",
            },
        )
        assert wh1.status_code == 200
        assert wh1.json()["status"] == "processed"

        # Second call with same external_ref returns already_processed
        wh2 = await client.post(
            "/api/v1/webhooks/payment",
            json={
                "external_ref": f"ext_pay_{uid}",
                "category": "dues",
                "amount": "500.00",
            },
        )
        assert wh2.status_code == 200
        assert wh2.json()["status"] == "already_processed"

        # 4. Volunteer submits expense
        exp_res = await client.post(
            "/api/v1/expenses",
            headers={"Authorization": f"Bearer {vol_token}"},
            json={
                "description": "Bake sale supplies",
                "amount": "250.00",
            },
        )
        assert exp_res.status_code == 201
        exp_id = exp_res.json()["expense_id"]

        # 5. Volunteer attempts to approve their own expense ->
        # Should fail with FORBIDDEN (or SELF_APPROVAL_NOT_ALLOWED)
        self_app_res = await client.patch(
            f"/api/v1/expenses/{exp_id}?status=approved",
            headers={"Authorization": f"Bearer {vol_token}"},
        )
        assert self_app_res.status_code == 403

        # Treasurer submits their own expense
        tr_exp_res = await client.post(
            "/api/v1/expenses",
            headers={"Authorization": f"Bearer {treasurer_token}"},
            json={
                "description": "Stationery",
                "amount": "100.00",
            },
        )
        tr_exp_id = tr_exp_res.json()["expense_id"]

        # Treasurer attempts to approve their own expense -> Fails with SELF_APPROVAL_NOT_ALLOWED (403)
        tr_self_app = await client.patch(
            f"/api/v1/expenses/{tr_exp_id}?status=approved",
            headers={"Authorization": f"Bearer {treasurer_token}"},
        )
        assert tr_self_app.status_code == 403
        assert tr_self_app.json()["error"]["code"] == "SELF_APPROVAL_NOT_ALLOWED"

        # President approves Treasurer's expense -> Success!
        pres_app = await client.patch(
            f"/api/v1/expenses/{tr_exp_id}?status=approved",
            headers={"Authorization": f"Bearer {president_token}"},
        )
        assert pres_app.status_code == 200
        assert pres_app.json()["status"] == "approved"

        # Treasurer approves volunteer's expense and reimburses it
        tr_app = await client.patch(
            f"/api/v1/expenses/{exp_id}?status=approved",
            headers={"Authorization": f"Bearer {treasurer_token}"},
        )
        assert tr_app.status_code == 200

        reimb_res = await client.patch(
            f"/api/v1/expenses/{exp_id}?status=reimbursed",
            headers={"Authorization": f"Bearer {treasurer_token}"},
        )
        assert reimb_res.status_code == 200
        assert reimb_res.json()["status"] == "reimbursed"

        # 6. Check Treasurer summary and club balance
        balance_res = await client.get(
            "/api/v1/treasurer/balance",
            headers={"Authorization": f"Bearer {treasurer_token}"},
        )
        assert balance_res.status_code == 200
        bal_data = balance_res.json()
        assert "total_in" in bal_data
        assert "total_out" in bal_data
        assert "balance" in bal_data
