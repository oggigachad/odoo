import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_create_member_self_signup() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create a new member
        email = "rajesh.sharma@example.edu"
        res = await client.post(
            "/api/v1/members",
            json={"full_name": "Rajesh Sharma", "email": email, "phone": "+919876543210"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["full_name"] == "Rajesh Sharma"
        assert data["email"] == email
        assert data["is_active"] is False
        assert "member_id" in data

        # Duplicate email should return 409 DUPLICATE_EMAIL
        dup_res = await client.post(
            "/api/v1/members",
            json={"full_name": "Rajesh Sharma Duplicate", "email": email},
        )
        assert dup_res.status_code == 409
        dup_data = dup_res.json()
        assert dup_data["error"]["code"] == "DUPLICATE_EMAIL"


@pytest.mark.asyncio
async def test_member_lookup_unauthorized_for_public() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Looking up without officer token fails with 401
        res = await client.get("/api/v1/members/lookup?q=rajesh.sharma@example.edu")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "UNAUTHENTICATED"
