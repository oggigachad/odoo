import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.redis import (
    check_rate_limit,
    consume_magic_link_token,
    get_report_cache,
    invalidate_report_caches,
    set_report_cache,
    store_magic_link_token,
)
from app.main import app


@pytest.mark.asyncio
async def test_redis_report_cache_and_invalidation() -> None:
    test_data = {"sold": 10, "seats_left": 40}
    ok = await set_report_cache("ticket_availability", test_data, ttl=60)
    assert ok is True

    cached = await get_report_cache("ticket_availability")
    assert cached == test_data

    await invalidate_report_caches()
    after_invalidate = await get_report_cache("ticket_availability")
    assert after_invalidate is None


@pytest.mark.asyncio
async def test_redis_single_use_magic_link() -> None:
    token = uuid.uuid4().hex
    data = {"email": "test@skyline.edu", "portal": "officer"}

    stored = await store_magic_link_token(token, data, ttl_seconds=900)
    assert stored is True

    # First consumption via GETDEL retrieves data
    first_get = await consume_magic_link_token(token)
    assert first_get is not None
    assert first_get["email"] == "test@skyline.edu"

    # Second consumption must return None (single-use guarantee)
    second_get = await consume_magic_link_token(token)
    assert second_get is None


@pytest.mark.asyncio
async def test_redis_rate_limiter() -> None:
    client_ip = f"192.168.1.{uuid.uuid4().hex[:4]}"
    endpoint = "auth/magic-link"

    # Allow up to 3 calls
    for _ in range(3):
        allowed, retry_after = await check_rate_limit(endpoint, client_ip, limit=3, window_secs=60)
        assert allowed is True

    # 4th call should be rate limited
    allowed, retry_after = await check_rate_limit(endpoint, client_ip, limit=3, window_secs=60)
    assert allowed is False
    assert retry_after > 0


@pytest.mark.asyncio
async def test_ready_endpoint_reports_status() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/ready")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ready"
        assert data["database"] == "up"
        assert data["redis"] in ["up", "down"]
