import datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import async_session_factory
from app.core.security import create_session_token
from app.main import app
from app.models.schema_models import LeadershipRole


@pytest.mark.asyncio
async def test_shop_orders_and_non_member_limit() -> None:
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

        # 2. Officer creates product with non_member_limit = 3, sizes S (stock 5) and M (stock 5)
        prod_res = await client.post(
            "/api/v1/products",
            headers=auth_headers,
            json={
                "name": f"Club Hoodie {uid}",
                "price": "1200.00",
                "member_price": "900.00",
                "non_member_limit": 3,
                "variants": [
                    {"size": "S", "stock_quantity": 5},
                    {"size": "M", "stock_quantity": 5},
                ],
            },
        )
        assert prod_res.status_code == 201
        prod_data = prod_res.json()
        var_s = prod_data["variants"][0]["variant_id"]
        var_m = prod_data["variants"][1]["variant_id"]

        # 3. Non-member orders 2 units of S
        order1_res = await client.post(
            "/api/v1/orders",
            json={
                "buyer_name": "Non Member Buyer",
                "buyer_email": "buyer@example.com",
                "items": [{"variant_id": var_s, "quantity": 2}],
            },
        )
        assert order1_res.status_code == 201
        order1 = order1_res.json()
        assert order1["status"] == "placed"
        assert order1["total_amount"] == "2400.00"

        # 4. Another non-member attempts to order 2 units of M (would make 4 total non-member units > limit 3)
        # Should fail with NON_MEMBER_LIMIT_REACHED (409)
        order2_res = await client.post(
            "/api/v1/orders",
            json={
                "buyer_name": "Buyer 2",
                "buyer_email": "buyer2@example.com",
                "items": [{"variant_id": var_m, "quantity": 2}],
            },
        )
        assert order2_res.status_code == 409
        assert order2_res.json()["error"]["code"] == "NON_MEMBER_LIMIT_REACHED"

        # 5. Non-member cancels first order -> Stock is restored and non-member quota is freed!
        cancel_res = await client.post(f"/api/v1/orders/{order1['order_id']}/cancel")
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "cancelled"

        # Now Buyer 2 can order the 2 units of M!
        order2_retry = await client.post(
            "/api/v1/orders",
            json={
                "buyer_name": "Buyer 2",
                "buyer_email": "buyer2@example.com",
                "items": [{"variant_id": var_m, "quantity": 2}],
            },
        )
        assert order2_retry.status_code == 201
