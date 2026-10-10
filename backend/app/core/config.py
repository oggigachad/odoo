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
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str = "default-insecure-secret-key-change-in-prod"
    PAYMENT_WEBHOOK_SECRET: str = "default-insecure-webhook-secret"
    FRONTEND_URL: str = "http://localhost:5173"
    # Extra browser origins allowed to call the API (comma separated), e.g. the Vercel/Netlify site and its custom domain
    CORS_ORIGINS: str = ""
    SENTRY_DSN: str | None = None
    EMAIL_FROM: str = "noreply@skyline.edu"
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    # optional second mailbox, tried if the first one fails
    SMTP2_USER: str | None = None
    SMTP2_PASSWORD: str | None = None
    # Port tried when SMTP_PORT is unreachable (465 <-> 587): some networks drop one of them at random
    SMTP_FALLBACK_PORT: int | None = None
    # Optional e-mail services reached over HTTPS (port 443 is not filtered the way SMTP is). Tried first when set.
    BREVO_API_KEY: str | None = None
    RESEND_API_KEY: str | None = None
    # Or a tiny Google Apps Script web app that sends through your own Gmail over HTTPS (see DEPLOY.md)
    MAIL_RELAY_URL: str | None = None
    MAIL_RELAY_TOKEN: str | None = None
    GOOGLE_CLIENT_ID: str | None = None
    # MinIO object storage for product pictures and designs (required for product pictures)
    MINIO_ENDPOINT: str | None = None
    MINIO_ACCESS_KEY: str | None = None
    MINIO_SECRET_KEY: str | None = None
    MINIO_BUCKET: str = "skyline-media"
    MINIO_SECURE: bool = False
    # Secret used to sign ticket QR payloads (required, separate from JWT_SECRET)
    TICKET_SIGNING_SECRET: str | None = None
    # Razorpay Payment Gateway Credentials (loaded strictly from environment)
    RAZORPAY_KEY_ID: str | None = None
    RAZORPAY_KEY_SECRET: str | None = None
    RAZORPAY_WEBHOOK_SECRET: str | None = None
    TESTMAIL_API_KEY: str | None = None  # dev-only inbox for OTP testing
    TESTMAIL_NAMESPACE: str | None = None
    CURRENCY: str = "INR"
    CURRENCY_SYMBOL: str = "₹"
    # Who may create an account. Comma separated; a domain also matches its sub-domains.
    STUDENT_EMAIL_DOMAINS: str = "gmail.com,student.edu.in"
    ADMIN_EMAIL_DOMAINS: str = "company.com,company.in"

    @property
    def allowed_origins(self) -> list[str]:
        origins = [self.FRONTEND_URL.rstrip("/")] + [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]
        if self.APP_ENV != "production":
            origins += ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"]
        return list(dict.fromkeys(origins))

    @property
    def razorpay_configured(self) -> bool:
        return bool(self.RAZORPAY_KEY_ID and self.RAZORPAY_KEY_SECRET)

    @staticmethod
    def _domains(raw: str) -> list[str]:
        return [d.strip().lower().lstrip("@") for d in raw.split(",") if d.strip()]

    @property
    def student_domains(self) -> list[str]:
        return self._domains(self.STUDENT_EMAIL_DOMAINS)

    @property
    def admin_domains(self) -> list[str]:
        return self._domains(self.ADMIN_EMAIL_DOMAINS)

    @property
    def smtp_configured(self) -> bool:
        """True when any way of sending e-mail is set up (an HTTPS e-mail service or SMTP)."""
        if self.BREVO_API_KEY or self.RESEND_API_KEY or (self.MAIL_RELAY_URL and self.MAIL_RELAY_TOKEN):
            return True
        return bool(self.SMTP_HOST and ((self.SMTP_USER and self.SMTP_PASSWORD) or (self.SMTP2_USER and self.SMTP2_PASSWORD)))


settings = Settings()
