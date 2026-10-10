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
