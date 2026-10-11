import asyncio
import html
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
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


def _smtp_ports() -> list[int]:
    """Configured port first, then its sibling: some networks drop 465 or 587 at random."""
    first = settings.SMTP_PORT
    second = settings.SMTP_FALLBACK_PORT or (587 if first == 465 else 465)
    return [first] if second == first else [first, second]


def _send_smtp(messages: list[EmailMessage]) -> None:
    """Blocking delivery (run in a thread). Tries every mailbox on both ports, twice over, before giving up."""
    last: Exception | None = None
    local = settings.SMTP_HOST in ("localhost", "127.0.0.1")  # a local test sink has no TLS or login
    for _round in range(2):
        for user, password in _accounts():
            for port in _smtp_ports():
                try:
                    implicit_tls = port == 465
                    client = smtplib.SMTP_SSL if implicit_tls and not local else smtplib.SMTP
                    with client(settings.SMTP_HOST, port, timeout=12) as smtp:
                        if not local:
                            if not implicit_tls:
                                smtp.starttls()
                            smtp.login(user, password)
                        for msg in messages:
                            if "From" not in msg:
                                msg["From"] = formataddr(("Skyline Student Association", user))
                            smtp.send_message(msg)
                    return
                except Exception as exc:  # noqa: BLE001
                    logger.warning("SMTP %s:%s as %s failed: %s", settings.SMTP_HOST, port, user, exc)
                    last = exc
                    for msg in messages:
                        if "From" in msg:
                            del msg["From"]
    raise last or RuntimeError("No SMTP account configured")


def _api_payload(msg: EmailMessage) -> dict[str, str]:
    """Pull what an HTTPS e-mail service needs out of the finished message (the logo cid becomes a hosted link)."""
    html_part = msg.get_body(preferencelist=("html",))
    text_part = msg.get_body(preferencelist=("plain",))
    logo_url = f"{settings.FRONTEND_URL.rstrip('/')}/logo.png"
    return {
        "to": str(msg["To"]),
        "subject": str(msg["Subject"]),
        "html": html_part.get_content().replace("cid:skylinelogo", logo_url) if html_part else "",
        "text": text_part.get_content() if text_part else "",
    }


def _send_api(messages: list[EmailMessage]) -> None:
    """Send through Brevo or Resend over HTTPS. Raises if the service refuses."""
    import httpx

    sender_email = parseaddr(settings.EMAIL_FROM)[1] or settings.EMAIL_FROM
    with httpx.Client(timeout=30, follow_redirects=True) as http:
        for msg in messages:
            p = _api_payload(msg)
            if settings.MAIL_RELAY_URL and settings.MAIL_RELAY_TOKEN and not (settings.BREVO_API_KEY or settings.RESEND_API_KEY):
                res = http.post(settings.MAIL_RELAY_URL, json={"token": settings.MAIL_RELAY_TOKEN, "to": p["to"], "subject": p["subject"], "html": p["html"], "text": p["text"]})
                if res.status_code >= 300 or res.text.strip() != "ok":
                    raise RuntimeError(f"mail relay answered {res.status_code}: {res.text[:120]}")
                continue
            if settings.BREVO_API_KEY:
                res = http.post(
                    "https://api.brevo.com/v3/smtp/email",
                    headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
                    json={"sender": {"name": "Skyline Student Association", "email": sender_email}, "to": [{"email": p["to"]}],
                          "subject": p["subject"], "htmlContent": p["html"], "textContent": p["text"]},
                )
            else:
                res = http.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                    json={"from": f"Skyline Student Association <{sender_email}>", "to": [p["to"]], "subject": p["subject"],
                          "html": p["html"], "text": p["text"]},
                )
            if res.status_code >= 300:
                raise RuntimeError(f"e-mail service answered {res.status_code}: {res.text[:200]}")


def _deliver(messages: list[EmailMessage]) -> str:
    """HTTPS service first when configured, then SMTP. Returns which way worked."""
    if settings.BREVO_API_KEY or settings.RESEND_API_KEY or (settings.MAIL_RELAY_URL and settings.MAIL_RELAY_TOKEN):
        has_smtp = bool(_accounts() and settings.SMTP_HOST)
        try:
            _send_api(messages)
            return "https"
        except Exception as exc:  # noqa: BLE001
            logger.warning("HTTPS e-mail service failed (%s)%s", exc, ", trying SMTP" if has_smtp else "")
            if not has_smtp:
                raise
    _send_smtp(messages)
    return "smtp"


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
        link = f"{settings.FRONTEND_URL}/auth?token={job['token']}"
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
                       "Bring your ticket QR (Dashboard, Events, My Tickets).", "See you tomorrow", None, ("Open my tickets", settings.FRONTEND_URL + "/dashboard"))]
    if t == "announcement_broadcast":
        return [_build(to, f"[Skyline] {job['title']}", job["body"], job["title"]) for to in (recipients or [])]
    logger.warning("Unknown email job type: %s", t)
    return []


async def process_email(job: dict[str, Any]) -> bool:
    """Deliver a queued email. Without SMTP credentials the job is skipped with a warning (never retried)."""
    if not settings.smtp_configured:
        logger.warning("E-mail not configured (set BREVO_API_KEY, RESEND_API_KEY or SMTP_*): skipping '%s' email", job.get("type"))
        return True
    recipients = await _recipients_for_broadcast() if job.get("type") == "announcement_broadcast" else None
    messages = build_job_messages(job, recipients)
    if not messages:
        return True
    try:
        how = await asyncio.to_thread(_deliver, messages)
        logger.info("Email '%s' delivered by %s (%d message(s))", job.get("type"), how, len(messages))
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("SMTP delivery failed for '%s': %s", job.get("type"), exc)
        return False


MAX_ATTEMPTS = 5


async def _requeue_later(job: dict[str, Any], delay: float) -> None:
    """Put a failed job back after a pause without holding up the other e-mails."""
    await asyncio.sleep(delay)
    await enqueue_email(job)


async def run_email_worker(max_iterations: int | None = None) -> None:
    """Continuously processes jobs from queue:emails; a failed job is retried (up to 5 times, growing pauses)."""
    iteration = 0
    while max_iterations is None or iteration < max_iterations:
        job = await dequeue_email(timeout=1)
        if job:
            attempts = job.get("attempts", 0) + 1
            job["attempts"] = attempts
            success = await process_email(job)
            if not success:
                if attempts < MAX_ATTEMPTS:
                    delay = min(5 * attempts, 20)
                    logger.warning("Retrying email job %s in %ss (attempt %s of %s)", job.get("type"), delay, attempts, MAX_ATTEMPTS)
                    asyncio.create_task(_requeue_later(job, delay))
                else:
                    logger.error("Giving up on email job %s after %s attempts", job.get("type"), MAX_ATTEMPTS)
        iteration += 1
