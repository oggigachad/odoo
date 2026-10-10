import os

os.environ["APP_ENV"] = "test"
# Tests run against a dedicated database so they never pollute live data (create it from database/schema.sql).
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://skyline_admin:skyline_secure_password_2026@localhost:5432/skyline_test"
)
os.environ.setdefault("REDIS_URL", "redis://:skyline_redis_token_2026@127.0.0.1:6380/1")
os.environ.setdefault("JWT_SECRET", "skyline_super_secure_jwt_secret_token_512_bits_key")
# Never send real mail or touch real storage from tests (the .env holds live mailbox logins)
for _k in ("SMTP_USER", "SMTP_PASSWORD", "SMTP2_USER", "SMTP2_PASSWORD", "MINIO_ENDPOINT", "MINIO_ACCESS_KEY"):
    os.environ[_k] = ""
os.environ.setdefault("TICKET_SIGNING_SECRET", "test-ticket-signing-secret-not-for-production")
os.environ.setdefault("PAYMENT_WEBHOOK_SECRET", "skyline_webhook_secret_2026")


def pytest_sessionstart(session) -> None:  # type: ignore[no-untyped-def]
    """Start every run with clean rate-limit counters (test Redis lives in its own database, db 1)."""
    try:
        import redis

        redis.Redis.from_url(os.environ["REDIS_URL"]).flushdb()
    except Exception:
        pass
