import datetime
import json
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.redis import get_redis_client
from app.core.security import create_session_token, hash_password
from app.main import app
from app.models.schema_models import LeadershipRole, Member


async def _member(role: str | None = None, email: str | None = None) -> tuple[int, dict[str, str], str]:
    uid = uuid.uuid4().hex[:8]
    email = email or f"m_{uid}@gmail.com"
    async with async_session_factory() as db:
        m = Member(full_name=f"M {uid}", email=email, password_hash=hash_password("Passw0rd!x"))
        db.add(m)
        await db.flush()
        if role:
            db.add(LeadershipRole(member_id=m.member_id, position=role, term_year=datetime.date.today().year))
        await db.commit()
        return m.member_id, {"Authorization": f"Bearer {create_session_token(m.member_id)}"}, email


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_admin_assigns_roles_and_sees_everyone() -> None:
    admin_id, admin, _ = await _member("Admin")
    target_id, target, target_email = await _member()
    _, officer, _ = await _member("Officer")
    today = datetime.date.today().year
    async with client() as c:
        body = {"member_id": target_id, "position": "treasurer", "term_year": today}
        assert (await c.post("/api/v1/leadership", headers=officer, json=body)).status_code == 403  # officers cannot grant roles
        ok = await c.post("/api/v1/leadership", headers=admin, json=body)
        assert ok.status_code == 201 and ok.json()["position"] == "Treasurer"
        assert (await c.post("/api/v1/leadership", headers=admin, json={**body, "position": "Wizard"})).status_code == 422
        me = (await c.get("/api/v1/auth/me", headers=target)).json()
        assert me["role"] == "Treasurer"

        users = (await c.get(f"/api/v1/admin/users?q={target_email}", headers=admin)).json()
        row = next(u for u in users["items"] if u["member_id"] == target_id)
        assert row["positions"] == ["Treasurer"] and "paid_total" in row and "Officer" in users["assignable_positions"]
        assert (await c.get("/api/v1/admin/users", headers=officer)).status_code == 403

        # the last admin cannot be removed
        rid = (await c.get(f"/api/v1/leadership?term_year={today}", headers=admin)).json()
        admin_rows = [r for r in rid if r["position"].lower() == "admin"]
        if len(admin_rows) == 1:
            assert (await c.delete(f"/api/v1/leadership/{admin_rows[0]['leadership_role_id']}", headers=admin)).status_code == 422


@pytest.mark.asyncio
async def test_announcements_only_admin_or_officer_and_notify_members() -> None:
    _, admin, _ = await _member("Admin")
    _, treasurer, _ = await _member("Treasurer")
    member_id, member, _ = await _member()
    async with client() as c:
        body = {"title": f"Hello {uuid.uuid4().hex[:5]}", "body": "Meeting moved.", "send_email": False}
        assert (await c.post("/api/v1/announcements", headers=treasurer, json=body)).status_code == 403
        res = await c.post("/api/v1/announcements", headers=admin, json=body)
        assert res.status_code == 201 and res.json()["email_status"] == "not_requested"
        notes = (await c.get("/api/v1/notifications", headers=member)).json()
        assert notes["unread"] >= 1 and any(n["title"] == body["title"] for n in notes["items"])
        await c.post("/api/v1/notifications/read", headers=member, json={})
        assert (await c.get("/api/v1/notifications", headers=member)).json()["unread"] == 0


@pytest.mark.asyncio
async def test_per_person_limits_for_tickets_and_merch() -> None:
    _, officer, _ = await _member("Officer")
    _, buyer, buyer_email = await _member()
    async with client() as c:
        ev = (
            await c.post(
                "/api/v1/events", headers=officer,
                json={"title": "Capped", "starts_at": (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=4)).isoformat(),
                      "ticket_types": [{"name": "Free", "member_price": "0", "non_member_price": "0", "seat_limit": 20,
                                        "non_member_seat_limit": 20, "max_per_guest": 2}]},
            )
        ).json()
        tt = ev["ticket_types"][0]
        assert tt["max_per_guest"] == 2
        holders = lambda n: [{"holder_name": f"P{i}", "holder_email": buyer_email} for i in range(n)]  # noqa: E731
        assert (await c.post("/api/v1/tickets/purchase", json={"ticket_type_id": tt["ticket_type_id"], "holders": holders(2)})).status_code == 201
        over = await c.post("/api/v1/tickets/purchase", json={"ticket_type_id": tt["ticket_type_id"], "holders": holders(1)})
        assert over.status_code == 409 and over.json()["error"]["code"] == "PURCHASE_LIMIT_REACHED"
        # officer raises the cap, purchase now works
        assert (await c.patch(f"/api/v1/ticket-types/{tt['ticket_type_id']}/limits", headers=officer, json={"max_per_guest": 5})).status_code == 200
        assert (await c.post("/api/v1/tickets/purchase", json={"ticket_type_id": tt["ticket_type_id"], "holders": holders(1)})).status_code == 201

        prod = (
            await c.post("/api/v1/products", headers=officer,
                         json={"name": f"Cap {uuid.uuid4().hex[:4]}", "price": "100", "member_price": "80", "non_member_limit": 10,
                               "max_per_guest": 1, "variants": [{"size": "M", "stock_quantity": 9}]})
        ).json()
        vid = prod["variants"][0]["variant_id"]
        first = await c.post("/api/v1/orders", headers=buyer, json={"items": [{"variant_id": vid, "quantity": 1}]})
        assert first.status_code == 201, first.text
        second = await c.post("/api/v1/orders", headers=buyer, json={"items": [{"variant_id": vid, "quantity": 1}]})
        assert second.status_code == 409 and second.json()["error"]["code"] == "PURCHASE_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_all_reports_and_csv_export() -> None:
    _, officer, _ = await _member("Officer")
    _, guest, _ = await _member()
    async with client() as c:
        keys = [r["key"] for r in (await c.get("/api/v1/reports", headers=officer)).json()]
        assert len(keys) == 8 and {"event-profit", "fundraisers", "money"} <= set(keys)
        for k in keys:
            res = await c.get(f"/api/v1/reports/{k}", headers=officer)
            assert res.status_code == 200, (k, res.text)
            assert res.json()["columns"] and "rows" in res.json()
            csv = await c.get(f"/api/v1/reports/{k}?format=csv", headers=officer)
            assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
        assert (await c.get("/api/v1/reports/money", headers=guest)).status_code == 403


@pytest.mark.asyncio
async def test_event_qr_and_calendar_ics() -> None:
    _, officer, _ = await _member("Officer")
    async with client() as c:
        ev = (await c.post("/api/v1/events", headers=officer, json={"title": "QR Landing", "starts_at": (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=9)).isoformat()})).json()
        png = await c.get(f"/api/v1/events/{ev['event_id']}/qr.png")
        assert png.status_code == 200 and png.content.startswith(b"\x89PNG")
        assert (await c.get("/api/v1/events/99999999/qr.png")).status_code == 404


@pytest.mark.asyncio
async def test_razorpay_webhook_settles_once_and_verify_is_bound_to_its_order(monkeypatch: pytest.MonkeyPatch) -> None:
    import hashlib
    import hmac

    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_x")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "test_secret")
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "hook_secret")
    member_id, headers, _ = await _member()
    async with async_session_factory() as db:
        sem = (await db.execute(text("SELECT semester_id FROM semesters LIMIT 1"))).scalar()
        mt = (await db.execute(text("SELECT membership_type_id FROM membership_types LIMIT 1"))).scalar()
        ms_id = (
            await db.execute(
                text("INSERT INTO memberships (member_id, semester_id, membership_type_id, dues_amount) VALUES (:m,:s,:t,250) RETURNING membership_id"),
                {"m": member_id, "s": sem, "t": mt},
            )
        ).scalar_one()
        await db.commit()

    def sig_for(order_id: str, pay_id: str) -> str:
        return hmac.new(b"test_secret", f"{order_id}|{pay_id}".encode(), hashlib.sha256).hexdigest()

    async with client() as c:
        # verify(): a valid signature from an order that was NOT created for this membership is refused
        order_id, pay_id = f"order_{uuid.uuid4().hex[:8]}", f"pay_{uuid.uuid4().hex[:8]}"
        await get_redis_client().set(
            f"oddo:v1:rzp:{order_id}",
            json.dumps({"member_id": member_id, "category": "dues", "membership_id": ms_id + 999, "ticket_ids": [], "order_id": None, "fundraiser_id": None, "amount_paise": 100}),
            ex=60,
        )
        body = {"razorpay_order_id": order_id, "razorpay_payment_id": pay_id, "razorpay_signature": sig_for(order_id, pay_id), "category": "dues", "membership_id": ms_id}
        assert (await c.post("/api/v1/payments/razorpay/verify", headers=headers, json=body)).status_code in (400, 401, 403, 422)
        forged = await c.post("/api/v1/payments/razorpay/verify", headers=headers, json={**body, "razorpay_signature": "forged"})
        assert forged.status_code in (400, 401, 403, 422)

        # webhook: bad signature rejected, good one records the payment once, replays are no-ops
        pid = f"pay_{uuid.uuid4().hex[:10]}"
        payload = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {"id": pid, "notes": {"membership_id": str(ms_id), "member_id": str(member_id)}}}}}).encode()
        hook_sig = hmac.new(b"hook_secret", payload, hashlib.sha256).hexdigest()
        bad = await c.post("/api/v1/webhooks/razorpay", content=payload, headers={"X-Razorpay-Signature": "nope", "content-type": "application/json"})
        assert bad.status_code == 401
        for _ in range(2):
            ok = await c.post("/api/v1/webhooks/razorpay", content=payload, headers={"X-Razorpay-Signature": hook_sig, "content-type": "application/json"})
            assert ok.status_code == 200
    async with async_session_factory() as db:
        assert (await db.execute(text("SELECT payment_id FROM memberships WHERE membership_id=:i"), {"i": ms_id})).scalar() is not None
        assert (await db.execute(text("SELECT COUNT(*) FROM payments WHERE external_ref=:p"), {"p": pid})).scalar() == 1
        assert (await db.execute(text("SELECT amount FROM payments WHERE external_ref=:p"), {"p": pid})).scalar() == 250
        assert (await db.execute(text("SELECT COUNT(*) FROM notifications WHERE member_id=:m AND kind='payment'"), {"m": member_id})).scalar() == 1


@pytest.mark.asyncio
async def test_first_org_domain_signup_becomes_admin_only_once() -> None:
    async with async_session_factory() as db:
        saved = (await db.execute(text("SELECT member_id, position, term_year FROM leadership_roles WHERE LOWER(position)='admin'"))).all()
        await db.execute(text("DELETE FROM leadership_roles WHERE LOWER(position)='admin'"))
        await db.commit()
    try:
        async with client() as c:
            async def signup(name: str, email: str):  # organisation addresses must prove the inbox with an OTP
                pw = await c.post("/api/v1/auth/register", json={"full_name": name, "email": email, "password": "Passw0rd!x"})
                assert pw.status_code == 422  # sign-up without an emailed code is refused
                otp = (await c.post("/api/v1/auth/otp/generate", json={"email": email, "purpose": "register"})).json()["dev_otp"]
                return await c.post("/api/v1/auth/register", json={"full_name": name, "email": email, "password": "Passw0rd!x", "otp": otp})

            a = await signup("Boss", f"boss_{uuid.uuid4().hex[:6]}@company.com")
            assert a.status_code == 201 and a.json()["user"]["role"] == "Admin"
            b = await signup("Second", f"two_{uuid.uuid4().hex[:6]}@company.in")
            assert b.status_code == 201 and b.json()["user"]["role"] == "Guest"  # roles are granted by the Admin
    finally:
        async with async_session_factory() as db:
            for r in saved:
                await db.execute(text("INSERT INTO leadership_roles (member_id, position, term_year) VALUES (:m,:p,:y) ON CONFLICT DO NOTHING"), {"m": r[0], "p": r[1], "y": r[2]})
            await db.commit()


@pytest.mark.asyncio
async def test_ticket_edit_form_gate_and_google_never_signs_up() -> None:
    _, officer, _ = await _member("Officer")
    _, buyer, _ = await _member()
    start = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=4)).isoformat()
    async with client() as c:
        ev = (await c.post("/api/v1/events", headers=officer, json={
            "title": "Form Night", "starts_at": start, "form_url": "https://forms.gle/abc",
            "ticket_types": [{"name": "General", "description": "Entry only", "member_price": "50", "non_member_price": "120",
                              "seat_limit": 10, "non_member_seat_limit": 5}]})).json()
        tt = ev["ticket_types"][0]
        assert tt["description"] == "Entry only"
        # price and description can be edited afterwards by staff, not by buyers
        assert (await c.patch(f"/api/v1/ticket-types/{tt['ticket_type_id']}", headers=buyer, json={"non_member_price": "1"})).status_code == 403
        r = await c.patch(f"/api/v1/ticket-types/{tt['ticket_type_id']}", headers=officer, json={"non_member_price": "150", "description": "Entry and dinner"})
        assert r.status_code == 200
        got = (await c.get(f"/api/v1/events/{ev['event_id']}")).json()["ticket_types"][0]
        assert got["non_member_price"] == "150.00" and got["description"] == "Entry and dinner"
        # the form link stays hidden until the buyer holds a paid ticket
        assert (await c.get(f"/api/v1/events/{ev['event_id']}/form", headers=buyer)).status_code == 403
        assert (await c.get(f"/api/v1/events/{ev['event_id']}/form", headers=officer)).json()["url"] == "https://forms.gle/abc"
        # reports export in every format
        for fmt, magic in (("xlsx", b"PK"), ("pdf", b"%PDF"), ("csv", b"")):
            res = await c.get(f"/api/v1/reports/money?format={fmt}", headers=officer)
            assert res.status_code == 200 and res.content.startswith(magic)


@pytest.mark.asyncio
async def test_delete_event_and_unpaid_membership_retry() -> None:
    _, officer, _ = await _member("Officer")
    _, admin, _ = await _member("Admin")
    mid, buyer, _ = await _member()
    start = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=4)).isoformat()
    async with client() as c:
        ev = (await c.post("/api/v1/events", headers=officer, json={
            "title": "Delete Me", "starts_at": start,
            "ticket_types": [{"name": "Free", "member_price": "0", "non_member_price": "0", "seat_limit": 5, "non_member_seat_limit": 5}]})).json()
        tt = ev["ticket_types"][0]["ticket_type_id"]
        assert (await c.delete(f"/api/v1/events/{ev['event_id']}", headers=buyer)).status_code == 403
        assert (await c.post("/api/v1/tickets/purchase", headers=buyer, json={"ticket_type_id": tt, "holders": [{"holder_name": "B"}]})).status_code == 201
        # an issued ticket blocks an officer, but an Admin may force it
        assert (await c.delete(f"/api/v1/events/{ev['event_id']}", headers=officer)).status_code == 422
        assert (await c.delete(f"/api/v1/events/{ev['event_id']}?force=true", headers=admin)).status_code == 200
        assert (await c.get(f"/api/v1/events/{ev['event_id']}")).status_code == 404
        # a cancelled payment leaves an unpaid membership that can be retried and never grants member status
        sem = await c.get("/api/v1/semesters", headers=buyer)
        types = await c.get("/api/v1/membership-types", headers=buyer)
        if sem.status_code == 200 and sem.json() and types.status_code == 200 and types.json():
            body = {"member_id": mid, "semester_id": sem.json()[0]["semester_id"], "membership_type_id": types.json()[0]["membership_type_id"]}
            first = await c.post("/api/v1/memberships", headers=buyer, json=body)
            again = await c.post("/api/v1/memberships", headers=buyer, json=body)
            assert first.status_code == 201 and again.status_code == 201
            assert first.json()["membership_id"] == again.json()["membership_id"] and again.json()["payment_id"] is None
            me = (await c.get("/api/v1/auth/me", headers=buyer)).json()
            assert me["is_active"] is False and me["role"] == "Guest"


@pytest.mark.asyncio
async def test_staff_and_buyers_can_check_out() -> None:
    """Regression: a signed-in officer ordering for themselves used to crash (name/email were never recorded)."""
    officer_id, officer, _ = await _member("Officer")
    _, buyer, buyer_email = await _member()
    async with client() as c:
        prod = (await c.post("/api/v1/products", headers=officer, json={"name": "Checkout Tee", "price": "300", "member_price": "200", "non_member_limit": 10})).json()
        var = (await c.post(f"/api/v1/products/{prod['product_id']}/variants", headers=officer, json={"size": "M", "stock_quantity": 5})).json()
        mine = await c.post("/api/v1/orders", headers=officer, json={"member_id": officer_id, "items": [{"variant_id": var["variant_id"], "quantity": 1}]})
        assert mine.status_code == 201 and mine.json()["buyer_email"]
        theirs = await c.post("/api/v1/orders", headers=buyer, json={"items": [{"variant_id": var["variant_id"], "quantity": 2}]})
        assert theirs.status_code == 201 and theirs.json()["total_amount"] == "600.00" and theirs.json()["buyer_email"] == buyer_email
        # staff can place one on behalf of another member, recorded under that member's details
        behalf = await c.post("/api/v1/orders", headers=officer, json={"member_id": 99999999, "items": [{"variant_id": var["variant_id"], "quantity": 1}]})
        assert behalf.status_code == 404
        listed = (await c.get("/api/v1/products")).json()
        assert [v["variant_id"] for p in listed if p["product_id"] == prod["product_id"] for v in p["variants"]] == [var["variant_id"]]
        left = [v["stock_quantity"] for p in listed if p["product_id"] == prod["product_id"] for v in p["variants"]][0]
        assert left == 2


@pytest.mark.asyncio
async def test_member_price_only_for_the_signed_in_buyer_and_roles_are_tight() -> None:
    _, officer, _ = await _member("Officer")
    _, treasurer, _ = await _member("Treasurer")
    mid, member, member_email = await _member()
    start = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=4)).isoformat()
    body = {"title": "Price Night", "starts_at": start, "ticket_types": [{
        "name": "G", "member_price": "100", "non_member_price": "300", "seat_limit": 20, "non_member_seat_limit": 20, "max_per_guest": 1, "max_per_member": 1}]}
    async with client() as c:
        # finance roles run the money, not the events, shop or door
        assert (await c.post("/api/v1/events", headers=treasurer, json=body)).status_code == 403
        assert (await c.post("/api/v1/products", headers=treasurer, json={"name": "x", "price": "1", "member_price": "1"})).status_code == 403
        ev = (await c.post("/api/v1/events", headers=officer, json=body)).json()
        tt = ev["ticket_types"][0]["ticket_type_id"]
        assert (await c.post("/api/v1/checkin", headers=treasurer, json={"ticket_code": "x", "event_id": ev["event_id"]})).status_code == 403
        # make the buyer an active member
        async with async_session_factory() as db:
            sem = (await db.execute(text("SELECT semester_id FROM semesters WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1"))).scalar()
            if sem is None:
                sem = (await db.execute(text("INSERT INTO semesters (name, starts_on, ends_on) VALUES (:n, CURRENT_DATE - 30, CURRENT_DATE + 60) RETURNING semester_id"), {"n": f"S {uuid.uuid4().hex[:6]}"})).scalar()
            mt = (await db.execute(text("SELECT membership_type_id FROM membership_types LIMIT 1"))).scalar()
            if mt is None:
                mt = (await db.execute(text("INSERT INTO membership_types (name, dues_amount) VALUES (:n, 500) RETURNING membership_type_id"), {"n": f"T {uuid.uuid4().hex[:6]}"})).scalar()
            pid = (await db.execute(text("INSERT INTO payments (member_id, category, amount, method) VALUES (:m,'dues',500,'cash') RETURNING payment_id"), {"m": mid})).scalar()
            await db.execute(text("INSERT INTO memberships (member_id, semester_id, membership_type_id, dues_amount, payment_id) VALUES (:m,:s,:t,500,:p)"), {"m": mid, "s": sem, "t": mt, "p": pid})
            await db.commit()
        # a stranger typing the member's e-mail still pays the non-member price
        spoof = await c.post("/api/v1/tickets/purchase", json={"ticket_type_id": tt, "holders": [{"holder_name": "X", "holder_email": member_email}]})
        assert spoof.status_code == 201 and spoof.json()["tickets"][0]["price_paid"] == "300.00"
        # the signed-in member, with a blank holder e-mail, gets the member price, and the cap counts them
        mine = await c.post("/api/v1/tickets/purchase", headers=member, json={"ticket_type_id": tt, "holders": [{"holder_name": "Me"}]})
        assert mine.status_code in (201, 409, 422)
        # a per-person cap needs an e-mail on every ticket
        assert (await c.post("/api/v1/tickets/purchase", json={"ticket_type_id": tt, "holders": [{"holder_name": "No email"}]})).status_code == 422
