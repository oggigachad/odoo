import asyncio

import pytest
from aiosmtpd.controller import Controller

from app.core.config import settings
from app.jobs.email_worker import process_email


class Sink:
    def __init__(self) -> None:
        self.messages: list = []

    async def handle_DATA(self, server, session, envelope):  # noqa: N802
        self.messages.append(envelope)
        return "250 OK"


@pytest.mark.asyncio
async def test_otp_email_is_branded_with_logo_and_falls_back_to_second_mailbox(monkeypatch: pytest.MonkeyPatch) -> None:
    sink = Sink()
    ctl = Controller(sink, hostname="127.0.0.1", port=18025)
    ctl.start()
    try:
        monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
        monkeypatch.setattr(settings, "SMTP_PORT", 18025)
        monkeypatch.setattr(settings, "SMTP_USER", "main@example.com")
        monkeypatch.setattr(settings, "SMTP_PASSWORD", "x")
        monkeypatch.setattr(settings, "SMTP2_USER", "backup@example.com")
        monkeypatch.setattr(settings, "SMTP2_PASSWORD", "y")
        assert await process_email({"type": "otp", "to": "student@gmail.com", "otp": "123456"}) is True
        assert len(sink.messages) == 1
        raw = sink.messages[0].content.decode()
        assert "123456" in raw and "text/html" in raw and "Content-ID: <skylinelogo>" in raw and "image/png" in raw
        assert sink.messages[0].rcpt_tos == ["student@gmail.com"]
        assert "main@example.com" in raw  # sent from the first configured mailbox
    finally:
        ctl.stop()
        await asyncio.sleep(0)


def test_https_email_service_is_used_first_and_carries_the_code(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    from app.jobs import email_worker

    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(201, json={"messageId": "x"})

    real_client = httpx.Client
    monkeypatch.setattr(email_worker, "_send_smtp", lambda msgs: (_ for _ in ()).throw(AssertionError("SMTP must not be used")))
    monkeypatch.setattr(httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(settings, "BREVO_API_KEY", "test-key")
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    monkeypatch.setattr(settings, "EMAIL_FROM", "Club <club@example.com>")
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://site.example")

    msgs = email_worker.build_job_messages({"type": "otp", "to": "student@gmail.com", "otp": "123456"})
    assert email_worker._deliver(msgs) == "https"
    body = __import__("json").loads(seen[0].content)
    assert seen[0].url.host == "api.brevo.com" and seen[0].headers["api-key"] == "test-key"
    assert body["to"] == [{"email": "student@gmail.com"}] and body["sender"]["email"] == "club@example.com"
    assert "123456" in body["htmlContent"] and "https://site.example/logo.png" in body["htmlContent"] and "cid:" not in body["htmlContent"]


def test_https_failure_without_smtp_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    from app.jobs import email_worker

    real_client = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(lambda r: httpx.Response(401, text="bad key")), **kw))
    monkeypatch.setattr(settings, "RESEND_API_KEY", "k")
    monkeypatch.setattr(settings, "BREVO_API_KEY", None)
    monkeypatch.setattr(settings, "SMTP_HOST", None)
    msgs = email_worker.build_job_messages({"type": "otp", "to": "a@gmail.com", "otp": "111111"})
    with pytest.raises(RuntimeError, match="401"):
        email_worker._deliver(msgs)


def test_gmail_relay_over_https(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    from app.jobs import email_worker

    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, text="ok")

    real_client = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(settings, "BREVO_API_KEY", None)
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    monkeypatch.setattr(settings, "MAIL_RELAY_URL", "https://script.google.com/macros/s/abc/exec")
    monkeypatch.setattr(settings, "MAIL_RELAY_TOKEN", "secret")
    monkeypatch.setattr(settings, "SMTP_HOST", None)
    msgs = email_worker.build_job_messages({"type": "otp", "to": "student@gmail.com", "otp": "654321"})
    assert email_worker._deliver(msgs) == "https"
    body = __import__("json").loads(seen[0].content)
    assert body["token"] == "secret" and body["to"] == "student@gmail.com" and "654321" in body["html"] and "654321" in body["subject"]
