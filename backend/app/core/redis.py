import asyncio
import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

KEY_PREFIX = "oddo:v1:"

# Report cache keys
REPORT_CACHE_KEYS = [
    "ticket_availability",
    "active_members",
    "club_balance",
    "fundraiser_progress",
]

_clients: dict[Optional[asyncio.AbstractEventLoop], aioredis.Redis] = {}


def get_redis_client() -> aioredis.Redis:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop not in _clients:
        _clients[loop] = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
        )
    return _clients[loop]


def _make_key(key: str) -> str:
    return f"{KEY_PREFIX}{key}"


async def check_redis_health() -> bool:
    """Return True if Redis responds to ping, False otherwise."""
    try:
        client = get_redis_client()
        res = await client.ping()
        return True if res else False
    except Exception as exc:
        logger.warning(f"Redis health check failed: {exc}")
        return False


# ---------------------------------------------------------------------
# Job 1: Cache (cache:{report_name}, 30-60s TTL)
# ---------------------------------------------------------------------
async def get_report_cache(report_name: str) -> Optional[Any]:
    try:
        client = get_redis_client()
        key = _make_key(f"cache:{report_name}")
        val = await client.get(key)
        if val is not None:
            return json.loads(val)
        return None
    except Exception as exc:
        logger.warning(f"Redis get_report_cache failed for {report_name}: {exc}")
        return None


async def set_report_cache(report_name: str, data: Any, ttl: int = 60) -> bool:
    try:
        client = get_redis_client()
        key = _make_key(f"cache:{report_name}")
        val = json.dumps(data)
        await client.set(key, val, ex=ttl)
        return True
    except Exception as exc:
        logger.warning(f"Redis set_report_cache failed for {report_name}: {exc}")
        return False


async def delete_report_cache(report_name: str) -> None:
    """Delete a cached report copy by name."""
    try:
        client = get_redis_client()
        key = _make_key(f"cache:{report_name}")
        await client.delete(key)
    except Exception as exc:
        logger.warning(f"Redis delete_report_cache failed for {report_name}: {exc}")


async def invalidate_report_caches() -> None:
    """Delete cached report copies after payment or check-in."""
    try:
        client = get_redis_client()
        keys = [_make_key(f"cache:{k}") for k in REPORT_CACHE_KEYS]
        await client.delete(*keys)
    except Exception as exc:
        logger.warning(f"Redis invalidate_report_caches failed: {exc}")


# ---------------------------------------------------------------------
# Job 2: Rate limits (rate:{endpoint}:{ip}, 1 min TTL)
# ---------------------------------------------------------------------
async def check_rate_limit(
    endpoint: str,
    client_ip: str,
    limit: int = 10,
    window_secs: int = 60,
) -> tuple[bool, int]:
    """
    Returns (is_allowed, retry_after_seconds).
    If Redis is down, fails open (returns (True, 0)) and logs.
    """
    try:
        client = get_redis_client()
        key = _make_key(f"rate:{endpoint}:{client_ip}")
        # Atomic incr
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, window_secs)

        ttl = await client.ttl(key)
        retry_after = ttl if ttl > 0 else window_secs

        if count > limit:
            return False, retry_after
        return True, 0
    except Exception as exc:
        logger.warning(f"Redis rate limit check failed for {endpoint} ({client_ip}): {exc}")
        return True, 0


# ---------------------------------------------------------------------
# Job 3: One-time sign-in links (signin:{token}, 15 min TTL, GETDEL)
# ---------------------------------------------------------------------
async def store_magic_link_token(
    token: str,
    data: dict[str, Any],
    ttl_seconds: int = 900,
) -> bool:
    """Stores sign-in token with TTL. Returns False if Redis is unreachable."""
    try:
        client = get_redis_client()
        key = _make_key(f"signin:{token}")
        await client.set(key, json.dumps(data), ex=ttl_seconds)
        return True
    except Exception as exc:
        logger.error(f"Failed to store magic link in Redis: {exc}")
        return False


async def consume_magic_link_token(token: str) -> Optional[dict[str, Any]]:
    """
    Atomically retrieves and deletes the token (single-use link via GETDEL or Lua fallback).
    Returns None if missing, already used, or Redis error.
    """
    try:
        client = get_redis_client()
        key = _make_key(f"signin:{token}")
        try:
            val = await client.getdel(key)
        except Exception:
            # Atomic single-use fallback for Redis < 6.2
            lua = "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]) end; return v"
            val = await client.eval(lua, 1, key)
        if val is not None:
            return json.loads(val)  # type: ignore[no-any-return]
        return None
    except Exception as exc:
        logger.error(f"Failed to consume magic link token from Redis: {exc}")
        return None


# ---------------------------------------------------------------------
# Job 4: Job queue (queue:emails)
# ---------------------------------------------------------------------
async def enqueue_email(payload: dict[str, Any]) -> bool:
    """Pushes email job to queue:emails."""
    try:
        client = get_redis_client()
        key = _make_key("queue:emails")
        await client.rpush(key, json.dumps(payload))
        return True
    except Exception as exc:
        logger.warning(f"Failed to enqueue email to Redis: {exc}")
        return False


async def dequeue_email(timeout: int = 1) -> Optional[dict[str, Any]]:
    """Pops an email from queue:emails."""
    try:
        client = get_redis_client()
        key = _make_key("queue:emails")
        res = await client.blpop([key], timeout=timeout)
        if res:
            _, item_data = res
            return json.loads(item_data)  # type: ignore[no-any-return]
        return None
    except Exception as exc:
        logger.warning(f"Failed to dequeue email from Redis: {exc}")
        return None


# ---------------------------------------------------------------------
# Job 5: One-Time Passcodes (OTP) (otp:{email}, 5 min TTL)
# ---------------------------------------------------------------------
async def store_otp(email: str, otp: str, ttl_seconds: int = 300) -> bool:
    """Store 6-digit OTP code in Redis with TTL and attempt counter."""
    try:
        client = get_redis_client()
        key = _make_key(f"otp:{email.lower()}")
        data = {"otp": otp, "attempts": 0}
        await client.set(key, json.dumps(data), ex=ttl_seconds)
        return True
    except Exception as exc:
        logger.error(f"Failed to store OTP in Redis: {exc}")
        return False


async def verify_and_consume_otp(email: str, otp: str, max_attempts: int = 5) -> tuple[bool, str]:
    """
    Verify OTP with brute-force attempt throttling.
    Returns (is_valid, message). On success, atomically removes OTP.
    """
    try:
        client = get_redis_client()
        key = _make_key(f"otp:{email.lower()}")
        val = await client.get(key)
        if not val:
            return False, "OTP has expired or is invalid. Please request a new one."

        data = json.loads(val)
        current_attempts = data.get("attempts", 0)

        if current_attempts >= max_attempts:
            await client.delete(key)
            return False, "Maximum verification attempts exceeded. For security, please request a new OTP."

        if data.get("otp") != otp.strip():
            data["attempts"] = current_attempts + 1
            ttl = await client.ttl(key)
            if ttl > 0:
                await client.set(key, json.dumps(data), ex=ttl)
            remaining = max_attempts - data["attempts"]
            return False, f"Incorrect verification code. {remaining} attempt(s) remaining."

        # Correct OTP: delete to guarantee single-use consumption
        await client.delete(key)
        return True, "Verification successful."
    except Exception as exc:
        logger.error(f"Failed to verify OTP from Redis: {exc}")
        return False, "Authentication service error."
