from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Student Organization System"
    APP_ENV: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://sos:sos@localhost:5432/sos_dev"
    SYNC_DATABASE_URL: str = "postgresql://sos:sos@localhost:5432/sos_dev"
    JWT_SECRET: str = "default-insecure-secret-key-change-in-prod"
    PAYMENT_WEBHOOK_SECRET: str = "default-insecure-webhook-secret"
    SENTRY_DSN: str | None = None


settings = Settings()
