import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import (
    create_magic_link_token,
    create_session_token,
    decode_magic_link_token,
    decode_session_token,
)
from app.main import app


def test_magic_link_and_session_tokens() -> None:
    email = "test.student@example.edu"
    token = create_magic_link_token(email)
    decoded_email = decode_magic_link_token(token)
    assert decoded_email == email

    session_token = create_session_token(42)
    member_id = decode_session_token(session_token)
    assert member_id == 42


@pytest.mark.asyncio
async def test_magic_link_always_returns_202() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Request with any email address
        response = await client.post("/api/v1/auth/magic-link", json={"email": "random@unknown.org"})
        assert response.status_code == 202
        assert "message" in response.json()


@pytest.mark.asyncio
async def test_unauthenticated_me_endpoint() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401
        data = response.json()
        assert data["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_otp_generation_and_verification() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Generate OTP for registered admin
        gen_res = await client.post("/api/v1/auth/otp/generate", json={"email": "admin@skyline.edu"})
        assert gen_res.status_code == 200
        data = gen_res.json()
        assert "dev_otp" in data
        assert len(data["dev_otp"]) == 6
        otp_code = data["dev_otp"]

        # 2. Verify OTP
        verify_res = await client.post("/api/v1/auth/otp/verify", json={"email": "admin@skyline.edu", "otp": otp_code})
        assert verify_res.status_code == 200
        token_data = verify_res.json()
        assert "token" in token_data
        assert token_data["token_type"] == "bearer"

        # 3. Access /auth/me with session token
        me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token_data['token']}"})
        assert me_res.status_code == 200
        profile = me_res.json()
        assert profile["email"] == "admin@skyline.edu"
        assert "Admin" in profile["roles"]


@pytest.mark.asyncio
async def test_otp_invalid_attempt() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Generate OTP
        await client.post("/api/v1/auth/otp/generate", json={"email": "treasurer@skyline.edu"})

        # Submit wrong OTP
        wrong_res = await client.post("/api/v1/auth/otp/verify", json={"email": "treasurer@skyline.edu", "otp": "000000"})
        assert wrong_res.status_code == 401
        err = wrong_res.json()
        assert "Incorrect verification code" in err["error"]["message"]
