import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_check() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        assert "X-Request-ID" in response.headers


@pytest.mark.asyncio
async def test_config() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/config")
        assert response.status_code == 200
        assert response.json() == {"ads_enabled": True}


@pytest.mark.asyncio
async def test_error_shape_404() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/non-existent-endpoint")
        assert response.status_code == 404
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "NOT_FOUND"
        assert "request_id" in data["error"]
