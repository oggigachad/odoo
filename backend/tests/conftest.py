import os

os.environ["APP_ENV"] = "test"
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://sos:sos@localhost:5432/sos_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "ci-only-secret-not-for-production")
os.environ.setdefault("PAYMENT_WEBHOOK_SECRET", "ci-only-webhook-secret")
