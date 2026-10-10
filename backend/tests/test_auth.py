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
