"""Check your mail settings:  python -m scripts.send_test_email you@gmail.com

Sends the real branded OTP email through the configured SMTP account(s) and prints exactly what happened.
"""
import asyncio
import sys

from app.core.config import settings
from app.jobs import email_worker


async def main(to: str) -> None:
    print(f"SMTP host: {settings.SMTP_HOST}:{settings.SMTP_PORT}")
    print("accounts:", [u for u, _ in email_worker._accounts()] or "NONE configured")
    if not email_worker._accounts() or not settings.SMTP_HOST:
        print("Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD (a Gmail App Password) in backend/.env first.")
        return
    msgs = email_worker.build_job_messages({"type": "otp", "to": to, "otp": "482915"})
    try:
        await asyncio.to_thread(email_worker._send_smtp, msgs)
        print(f"Sent a test code email to {to}. Check the inbox (and spam).")
    except Exception as exc:  # noqa: BLE001
        print(f"FAILED: {exc}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "you@example.com"))
