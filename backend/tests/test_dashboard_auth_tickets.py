import datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import async_session_factory
from app.core.security import create_session_token, hash_password, parse_ticket_qr_payload
from app.main import app
from app.models.schema_models import LeadershipRole, Member


async def _reg(client: AsyncClient, email: str, **extra):  # type: ignore[no-untyped-def]
    from app.core.redis import store_otp

    await store_otp(email, "424242", ttl_seconds=300)
    body = {"full_name": "T", "email": email, "password": "Passw0rd!x", "otp": "424242", **extra}
    return await client.post("/api/v1/auth/register", json=body)


async def _make_member(client: AsyncClient, role: str | None = None) -> tuple[int, dict[str, str], str]:
    """Insert a member straight into the test DB (the public register endpoint is rate-limited)."""
    uid = uuid.uuid4().hex[:8]
    email = f"u_{uid}@skyline.edu"
    async with async_session_factory() as db:
        m = Member(full_name=f"User {uid}", email=email, password_hash=hash_password("Passw0rd!x"))
        db.add(m)
        await db.flush()
        mid = m.member_id
        if role:
            db.add(LeadershipRole(member_id=mid, position=role, term_year=datetime.date.today().year))
        await db.commit()
    return mid, {"Authorization": f"Bearer {create_session_token(mid)}"}, email


@pytest.mark.asyncio
async def test_register_login_and_role_resolution() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _, headers, email = await _make_member(client)
        # Guests start as Guest and cannot self-promote
        me = (await client.get("/api/v1/auth/me", headers=headers)).json()
        assert me["role"] == "Guest"

        bad = await client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password"})
        assert bad.status_code == 401
        ok = await client.post("/api/v1/auth/login", json={"email": email, "password": "Passw0rd!x"})
        assert ok.status_code == 200 and ok.json()["user"]["role"] == "Guest"

        gm = f"dup_{uuid.uuid4().hex[:6]}@gmail.com"
        nootp = await client.post("/api/v1/auth/register", json={"full_name": "Dup", "email": gm, "password": "Passw0rd!x"})
        assert nootp.status_code == 422  # a code is mandatory
        wrong = await client.post("/api/v1/auth/register", json={"full_name": "Dup", "email": gm, "password": "Passw0rd!x", "otp": "000000"})
        assert wrong.status_code == 401  # a random number does not get anyone in
        first = await _reg(client, gm, full_name="Dup")
        assert first.status_code == 201 and first.json()["user"]["role"] == "Guest"
        dup = await _reg(client, gm, full_name="Dup")
        assert dup.status_code == 409

        # Sign-up domain rules: students use gmail.com / student.edu.in, staff use the organisation domain
        for ok_mail in (f"s_{uuid.uuid4().hex[:6]}@student.edu.in", f"s_{uuid.uuid4().hex[:6]}@cs.student.edu.in"):
            r = await _reg(client, ok_mail, full_name="S")
            assert r.status_code == 201, ok_mail
        for bad in (f"x_{uuid.uuid4().hex[:6]}@yahoo.com", f"x_{uuid.uuid4().hex[:6]}@skyline.edu"):
            r = await _reg(client, bad, full_name="X")
            assert r.status_code == 422, bad
        rules = (await client.get("/api/v1/auth/signup-rules")).json()
        assert "gmail.com" in rules["student_domains"] and "company.com" in rules["admin_domains"]

        # Student IDs with campus delimiters are accepted; junk is not (ISSUE-005)
        good_sid = await _reg(client, f"e_{uuid.uuid4().hex[:6]}@gmail.com", full_name="Exch", student_id="NMIT/CS/2026-01")
        assert good_sid.status_code == 201
        bad_sid = await _reg(client, f"b_{uuid.uuid4().hex[:6]}@gmail.com", full_name="Bad", student_id="no spaces!")
        assert bad_sid.status_code == 422


@pytest.mark.asyncio
async def test_roles_map_to_access_levels() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for position, expected in [
            ("Admin", "Admin"),
            ("Accountant", "Treasurer"),
            ("Treasurer", "Treasurer"),
            ("Secretary", "Officer"),
        ]:
            _, headers, _ = await _make_member(client, position)
            me = (await client.get("/api/v1/auth/me", headers=headers)).json()
            assert me["role"] == expected, position
        # Accountant gets treasurer reports, a plain guest does not
        _, acct, _ = await _make_member(client, "Accountant")
        assert (await client.get("/api/v1/treasurer/balance", headers=acct)).status_code == 200
        _, guest, _ = await _make_member(client)
        assert (await client.get("/api/v1/treasurer/balance", headers=guest)).status_code == 403
        assert (await client.get("/api/v1/members", headers=guest)).status_code == 403


@pytest.mark.asyncio
async def test_ticket_qr_pdf_and_checkin_flow() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _, officer, _ = await _make_member(client, "Officer")
        _, buyer, buyer_email = await _make_member(client)
        ev = (
            await client.post(
                "/api/v1/events",
                headers=officer,
                json={
                    "title": "QR Night",
                    "starts_at": (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3)).isoformat(),
                    "ticket_types": [
                        {
                            "name": "Free",
                            "member_price": "0.00",
                            "non_member_price": "0.00",
                            "seat_limit": 10,
                            "non_member_seat_limit": 10,
                        }
                    ],
                },
            )
        ).json()
        tt_id = ev["ticket_types"][0]["ticket_type_id"]
        purchase = await client.post(
            "/api/v1/tickets/purchase",
            json={"ticket_type_id": tt_id, "holders": [{"holder_name": "Buyer One", "holder_email": buyer_email}]},
        )
        assert purchase.status_code == 201
        t = purchase.json()["tickets"][0]
        assert t["qr_payload"].startswith("SKYLINE1.")
        assert parse_ticket_qr_payload(t["qr_payload"]) == t["ticket_code"]
        assert parse_ticket_qr_payload(t["qr_payload"][:-2] + "zz") is None  # tampered signature rejected

        # The buyer sees the ticket under "my tickets" (matched by email) and can download the PDF
        mine = (await client.get("/api/v1/me/tickets", headers=buyer)).json()
        assert any(x["ticket_code"] == t["ticket_code"] for x in mine)
        sig = t["qr_payload"].split(".")[2]
        pdf = await client.get(f"/api/v1/tickets/{t['ticket_code']}/pdf?sig={sig}")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
        png = await client.get(f"/api/v1/tickets/{t['ticket_code']}/qr.png?sig={sig}")
        assert png.status_code == 200 and png.content.startswith(b"\x89PNG")
        # No token and no session -> no download
        assert (await client.get(f"/api/v1/tickets/{t['ticket_code']}/pdf")).status_code == 403
        assert (await client.get(f"/api/v1/tickets/{t['ticket_code']}/pdf?sig=deadbeef")).status_code == 403

        # Forged QR is rejected at the door; the genuine one admits exactly once
        forged = await client.post(
            "/api/v1/checkin",
            headers=officer,
            json={"ticket_code": t["qr_payload"][:-2] + "zz", "event_id": ev["event_id"]},
        )
        assert forged.status_code == 404
        manifest = (await client.get(f"/api/v1/events/{ev['event_id']}/manifest", headers=officer)).json()
        assert manifest["tickets"][0]["qr_payload"] == t["qr_payload"]
        ok = await client.post(
            "/api/v1/checkin", headers=officer, json={"ticket_code": t["qr_payload"], "event_id": ev["event_id"]}
        )
        assert ok.status_code == 200 and ok.json()["status"] == "ADMITTED"
        again = await client.post(
            "/api/v1/checkin", headers=officer, json={"ticket_code": t["manual_code"], "event_id": ev["event_id"]}
        )
        assert again.status_code == 409

        # Offline batch replay reports per-scan results
        batch = await client.post(
            "/api/v1/checkin/batch",
            headers=officer,
            json={
                "event_id": ev["event_id"],
                "scans": [{"ticket_code": t["qr_payload"]}, {"ticket_code": str(uuid.uuid4())}],
            },
        )
        assert batch.status_code == 200
        res = batch.json()["results"]
        assert res[0]["ok"] is False and res[0]["error_code"] == "TICKET_ALREADY_CHECKED_IN"
        assert res[1]["ok"] is False


@pytest.mark.asyncio
async def test_dashboard_summary_is_live_and_role_scoped() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/v1/dashboard/summary")).status_code == 401
        _, officer, _ = await _make_member(client, "Officer")
        _, guest, _ = await _make_member(client)

        staff = (await client.get("/api/v1/dashboard/summary?tz_offset=330", headers=officer)).json()
        assert staff["scope"] == "club"
        assert {"sales", "visits", "payments", "effect"} <= set(staff["cards"])
        assert len(staff["sales"]["buckets"]) >= 1

        before = staff["cards"]["sales"]["value"]
        mine = (await client.get("/api/v1/dashboard/summary", headers=guest)).json()
        assert mine["scope"] == "personal" and mine["cards"]["sales"]["value"] == 0

        # A real payment moves the staff number immediately
        pay = await client.post("/api/v1/payments/cash", headers=officer, json={"category": "dues", "amount": "250.00"})
        assert pay.status_code in (200, 201), pay.text
        after = (await client.get("/api/v1/dashboard/summary?tz_offset=330", headers=officer)).json()
        assert after["cards"]["sales"]["value"] == before + 250.0

        bad = await client.get("/api/v1/dashboard/summary?start=2026-10-10&end=2026-10-01", headers=officer)
        assert bad.status_code == 422
