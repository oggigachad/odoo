import asyncio
import html
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.redis import dequeue_email, enqueue_email
from app.models.schema_models import Member

logger = logging.getLogger(__name__)

LOGO_PATH = Path(__file__).resolve().parents[3] / "frontend" / "public" / "logo.png"
BRAND = "#714B67"


def _accounts() -> list[tuple[str, str]]:
    """SMTP logins to try in order: the main one, then the optional fallback mailbox."""
    out: list[tuple[str, str]] = []
    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        out.append((settings.SMTP_USER, settings.SMTP_PASSWORD))
    if settings.SMTP2_USER and settings.SMTP2_PASSWORD:
        out.append((settings.SMTP2_USER, settings.SMTP2_PASSWORD))
    return out


def _send_smtp(messages: list[EmailMessage]) -> None:
    """Blocking delivery (run in a thread). Tries each configured mailbox until one works."""
    last: Exception | None = None
    for user, password in _accounts():
        try:
            implicit_tls = settings.SMTP_PORT == 465  # some networks block 587 but allow 465
            client = smtplib.SMTP_SSL if implicit_tls else smtplib.SMTP
            with client(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as smtp:
                if settings.SMTP_HOST not in ("localhost", "127.0.0.1"):  # a local test sink has no TLS or login
                    if not implicit_tls:
                        smtp.starttls()
                    smtp.login(user, password)
                for msg in messages:
                    if "From" not in msg:
                        msg["From"] = formataddr(("Skyline Student Association", user))
                    smtp.send_message(msg)
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning("SMTP login/send failed for %s: %s", user, exc)
            last = exc
            for msg in messages:
                if "From" in msg:
                    del msg["From"]
    raise last or RuntimeError("No SMTP account configured")


def _html(heading: str, body: str, code: str | None = None, cta: tuple[str, str] | None = None) -> str:
    code_block = (
        f'<div style="margin:22px 0;padding:16px;text-align:center;background:#f7f3f8;border-radius:14px;'
        f'font-size:34px;letter-spacing:10px;font-weight:700;color:{BRAND}">{html.escape(code)}</div>'
        if code else ""
    )
    cta_block = (
        f'<p style="margin:24px 0 0"><a href="{html.escape(cta[1])}" style="background:{BRAND};color:#fff;text-decoration:none;'
        f'padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">{html.escape(cta[0])}</a></p>'
        if cta else ""
    )
    paragraphs = "".join(f'<p style="margin:0 0 12px;line-height:1.55">{html.escape(p)}</p>' for p in body.split("\n\n") if p.strip())
    return (
        '<div style="background:#f3eef2;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#212529">'
        '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden">'
        f'<div style="background:{BRAND};padding:22px 28px"><img src="cid:skylinelogo" alt="Skyline" height="34" style="display:block"></div>'
        f'<div style="padding:28px"><h1 style="margin:0 0 14px;font-size:22px">{html.escape(heading)}</h1>{paragraphs}{code_block}{cta_block}'
        '<p style="margin:26px 0 0;font-size:12px;color:#8a8a8a">Skyline Student Association</p></div></div></div>'
    )


def _build(to: str, subject: str, text_body: str, heading: str | None = None, code: str | None = None, cta: tuple[str, str] | None = None) -> EmailMessage:
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text_body)
    msg.add_alternative(_html(heading or subject, text_body if not code else text_body.replace(code, "").strip(), code, cta), subtype="html")
    if LOGO_PATH.exists():
        # the logo is white artwork, so it sits on the purple header band
        msg.get_payload()[1].add_related(LOGO_PATH.read_bytes(), maintype="image", subtype="png", cid="<skylinelogo>")
    return msg


async def _recipients_for_broadcast() -> list[str]:
    async with async_session_factory() as session:
        res = await session.execute(select(Member.email))
        return [r[0] for r in res.all()]


def build_job_messages(job: dict[str, Any], recipients: list[str] | None = None) -> list[EmailMessage]:
    t = job.get("type")
    if t == "otp":
        return [_build(job["to"], f"{job['otp']} is your Skyline verification code",
                       f"Use this code to continue. It expires in 5 minutes.\n\n{job['otp']}\n\nIf you did not ask for it, you can ignore this email.",
                       "Your verification code", job["otp"])]
    if t == "magic_link":
        link = f"{settings.FRONTEND_URL}/#auth?token={job['token']}"
        return [_build(job["to"], "Your Skyline sign-in link", "Tap the button to sign in. The link works once and expires in 15 minutes.",
                       "Sign in to Skyline", None, ("Sign in", link))]
    if t == "renewal_reminder":
        return [_build(job["to"], "Your Skyline membership is about to expire",
                       f"Hi {job.get('name', '')}, your membership ends on {job['valid_until']} ({job['days_left']} days left). "
                       "Renew from the Membership tab to keep your member pricing.",
                       "Time to renew", None, ("Add reminder to Google Calendar", job.get("calendar_link", settings.FRONTEND_URL)))]
    if t == "event_reminder":
        return [_build(job["to"], f"Tomorrow: {job['title']}",
                       f"{job['title']} is on {job['when']}{(' at ' + job['venue']) if job.get('venue') else ''}.\n\n"
                       "Bring your ticket QR (Dashboard, Events, My Tickets).", "See you tomorrow", None, ("Open my tickets", settings.FRONTEND_URL + "/#dashboard"))]
    if t == "announcement_broadcast":
        return [_build(to, f"[Skyline] {job['title']}", job["body"], job["title"]) for to in (recipients or [])]
    logger.warning("Unknown email job type: %s", t)
    return []


async def process_email(job: dict[str, Any]) -> bool:
    """Deliver a queued email. Without SMTP credentials the job is skipped with a warning (never retried)."""
    if not _accounts() or not settings.SMTP_HOST:
        logger.warning("SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD): skipping '%s' email", job.get("type"))
        return True
    recipients = await _recipients_for_broadcast() if job.get("type") == "announcement_broadcast" else None
    messages = build_job_messages(job, recipients)
    if not messages:
        return True
    try:
        await asyncio.to_thread(_send_smtp, messages)
        logger.info("Email '%s' delivered (%d message(s))", job.get("type"), len(messages))
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("SMTP delivery failed for '%s': %s", job.get("type"), exc)
        return False


async def run_email_worker(max_iterations: int | None = None) -> None:
    """Continuously processes jobs from queue:emails."""
    iteration = 0
    while max_iterations is None or iteration < max_iterations:
        job = await dequeue_email(timeout=1)
        if job:
            attempts = job.get("attempts", 0) + 1
            job["attempts"] = attempts
            success = await process_email(job)
            if not success:
                if attempts < 3:
                    logger.warning(f"Retrying email job {job.get('type')}, attempt {attempts}")
                    await asyncio.sleep(2**attempts)
                    await enqueue_email(job)
                else:
                    logger.error(f"Failed to send email after 3 attempts: {job}")
        iteration += 1
