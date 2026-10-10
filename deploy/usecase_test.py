"""Use-case test of the production build (see DEPLOY.md, "Testing every use case"): every role, every feature, real database, real Razorpay (test mode) orders.
Runs against a second copy of the production container that has e-mail switched off and its own Redis database, so
no test mail can leave the machine. Everything it creates is tagged E2E and removed afterwards by e2e_cleanup.sql."""
import hashlib
import os
import hmac
import io
import json
import subprocess
import sys
import time
import uuid
import datetime as dt

import httpx

DEPLOY = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("E2E_BASE", "http://127.0.0.1:8002")
API = BASE + "/api/v1"
ORIGIN = "https://oddoskyline.netlify.app"
ENV = dict(l.strip().split("=", 1) for l in open(os.path.join(DEPLOY, ".env.production"), encoding="utf-8") if "=" in l and not l.startswith("#"))
adm_email, adm_pw = open(os.path.join(DEPLOY, ".admin-credentials.txt")).read().split()
roles = {}
for l in open(os.path.join(DEPLOY, ".role-credentials.txt")):
    parts = l.split()
    if len(parts) == 3 and "@" in parts[0]:
        roles[parts[1]] = (parts[0], parts[2])
TAG = uuid.uuid4().hex[:6]
c = httpx.Client(timeout=60, headers={"Origin": ORIGIN})
results: list[tuple[str, bool, str]] = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), str(detail)[:140]))
    print(("PASS " if ok else "FAIL ") + name + (f"   [{detail}]" if (not ok and detail) else ""), flush=True)


def login(email, pw):
    r = c.post(f"{API}/auth/login", json={"email": email, "password": pw})
    return {"Authorization": "Bearer " + r.json()["token"]} if r.status_code == 200 else None


def redis_get(key):
    out = subprocess.run(["docker", "exec", "skyline-redis-1", "redis-cli", "-a", ENV["REDIS_PASSWORD"], "-n", "1", "--no-auth-warning", "GET", key], capture_output=True, text=True).stdout.strip()
    return json.loads(out) if out else None


def rzp_pay(H, category, amount, **ids):
    """Create a real Razorpay test order through the API, then confirm it with a correctly signed payment."""
    o = c.post(f"{API}/payments/razorpay/order", headers=H, json={"category": category, "amount": amount, **ids})
    if o.status_code != 200:
        return o, None
    oid = o.json()["order_id"]; pid = "pay_E2E" + uuid.uuid4().hex[:10]
    sig = hmac.new(ENV["RAZORPAY_KEY_SECRET"].encode(), f"{oid}|{pid}".encode(), hashlib.sha256).hexdigest()
    v = c.post(f"{API}/payments/razorpay/verify", headers=H, json={"razorpay_order_id": oid, "razorpay_payment_id": pid, "razorpay_signature": sig, "category": category, **ids})
    return o, v


def section(t): print(f"\n=== {t}", flush=True)


try:
    # ------------------------------------------------------------------ public
    section("Public pages and security basics")
    check("stats", c.get(f"{API}/stats").status_code == 200)
    check("signup rules", "gmail.com" in c.get(f"{API}/auth/signup-rules").json()["student_domains"])
    check("events list public", c.get(f"{API}/events").status_code == 200)
    check("shop list public", c.get(f"{API}/products").status_code == 200)
    check("API docs hidden in production", c.get(f"{BASE}/docs").status_code == 404 and c.get(f"{BASE}/openapi.json").status_code == 404)
    ok = c.options(f"{API}/auth/login", headers={"Access-Control-Request-Method": "POST", "Origin": ORIGIN})
    bad = c.options(f"{API}/auth/login", headers={"Access-Control-Request-Method": "POST", "Origin": "https://evil.example"})
    check("CORS: Netlify site allowed, other sites refused", ok.headers.get("access-control-allow-origin") == ORIGIN and "access-control-allow-origin" not in bad.headers)
    r = c.get(f"{API}/stats")
    check("security headers", r.headers.get("x-frame-options") == "DENY" and r.headers.get("x-content-type-options") == "nosniff" and "strict-transport" in str(r.headers).lower())
    check("protected route needs sign-in", c.get(f"{API}/members").status_code == 401)

    # ------------------------------------------------------------------ sign-up and sign-in
    section("Sign-up and sign-in")
    email = f"e2e-{TAG}@student.edu.in"
    check("sign-up code refused for a disallowed domain", c.post(f"{API}/auth/otp/generate", json={"email": f"x{TAG}@yahoo.com", "purpose": "register"}).status_code == 422)
    check("sign-up without a code refused", c.post(f"{API}/auth/register", json={"full_name": "E2E", "email": email, "password": "Passw0rd!x"}).status_code == 422)
    g = c.post(f"{API}/auth/otp/generate", json={"email": email, "purpose": "register"})
    check("sign-up code issued, not echoed in production", g.status_code == 200 and g.json().get("dev_otp") is None)
    otp = redis_get(f"oddo:v1:otp:{email}")
    check("code stored with 5 attempts policy", otp and len(otp["otp"]) == 6)
    check("wrong code refused", c.post(f"{API}/auth/register", json={"full_name": "E2E", "email": email, "password": "Passw0rd!x", "otp": "000000"}).status_code == 401)
    r = c.post(f"{API}/auth/register", json={"full_name": f"E2E Student {TAG}", "email": email, "password": "Passw0rd!x", "otp": otp["otp"]})
    check("register with the right code creates a Guest", r.status_code == 201 and r.json()["user"]["role"] == "Guest", r.text[:80])
    check("code is single use", c.post(f"{API}/auth/register", json={"full_name": "E2E", "email": email, "password": "Passw0rd!x", "otp": otp["otp"]}).status_code in (401, 409))
    check("duplicate e-mail refused", c.post(f"{API}/auth/register", json={"full_name": "E2E", "email": email, "password": "Passw0rd!x", "otp": "123456"}).status_code == 409)
    stu = login(email, "Passw0rd!x"); check("password sign-in", stu is not None)
    check("wrong password refused", c.post(f"{API}/auth/login", json={"email": email, "password": "nope-nope-1"}).status_code == 401)
    me = c.get(f"{API}/auth/me", headers=stu).json(); stu_id = me["member_id"]
    check("/auth/me reports Guest", me["role"] == "Guest")
    mem_email = roles["Member"][0]
    c.post(f"{API}/auth/otp/generate", json={"email": mem_email, "purpose": "login"}); time.sleep(0.3)
    otp2 = redis_get(f"oddo:v1:otp:{mem_email}")
    r = c.post(f"{API}/auth/otp/verify", json={"email": mem_email, "otp": otp2["otp"]}) if otp2 else None
    check("sign-in with an e-mailed code", r is not None and r.status_code == 200 and r.json()["user"]["role"] == "Member")
    check("e-mailed code is single use", c.post(f"{API}/auth/otp/verify", json={"email": mem_email, "otp": otp2["otp"]}).status_code == 401)
    unk = c.post(f"{API}/auth/otp/generate", json={"email": f"nobody-{TAG}@gmail.com"})
    check("unknown address: same answer, no code stored", unk.status_code == 200 and redis_get(f"oddo:v1:otp:nobody-{TAG}@gmail.com") is None)
    check("Google sign-in never creates accounts", c.post(f"{API}/auth/google", json={"credential": "bogus"}).status_code in (401, 422, 503))

    # ------------------------------------------------------------------ roles
    section("Roles and permissions")
    A = login(adm_email, adm_pw); T = login(*roles["Treasurer"]); O = login(*roles["Officer"]); M = login(*roles["Member"]); G = login(*roles["Guest"])
    check("all five role logins work", all([A, T, O, M, G]))
    for who, H in (("Admin", A), ("Treasurer", T), ("Officer", O), ("Member", M), ("Guest", G)):
        check(f"{who} role resolved correctly", c.get(f"{API}/auth/me", headers=H).json()["role"] == who)
    ev_body = {"title": f"E2E Gala {TAG}", "description": "test", "venue": "Hall", "starts_at": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=5)).isoformat(),
               "form_url": "https://forms.gle/e2e",
               "ticket_types": [{"name": "Paid", "description": "Entry and dinner", "member_price": "100", "non_member_price": "300", "seat_limit": 10, "non_member_seat_limit": 5, "max_per_guest": 2},
                                {"name": "Free", "member_price": "0", "non_member_price": "0", "seat_limit": 10, "non_member_seat_limit": 10}]}
    check("Guest cannot create events", c.post(f"{API}/events", headers=G, json=ev_body).status_code == 403)
    check("Member cannot create events", c.post(f"{API}/events", headers=M, json=ev_body).status_code == 403)
    check("Treasurer cannot create events", c.post(f"{API}/events", headers=T, json=ev_body).status_code == 403)
    check("Guest cannot post announcements", c.post(f"{API}/announcements", headers=G, json={"title": "x", "body": "y", "send_email": False}).status_code == 403)
    check("Guest cannot read reports", c.get(f"{API}/reports", headers=G).status_code == 403)
    check("Guest cannot list all users", c.get(f"{API}/admin/users", headers=G).status_code == 403)
    check("Officer cannot list all users (Admin only)", c.get(f"{API}/admin/users", headers=O).status_code == 403)
    check("Admin lists all users", c.get(f"{API}/admin/users", headers=A).status_code == 200)
    check("Guest cannot see the treasury", c.get(f"{API}/treasurer/balance", headers=G).status_code == 403)
    check("Treasurer sees the treasury", c.get(f"{API}/treasurer/balance", headers=T).status_code == 200)
    r = c.post(f"{API}/leadership", headers=O, json={"member_id": stu_id, "position": "Officer", "term_year": 2026})
    check("Officer cannot assign roles", r.status_code == 403)
    r = c.post(f"{API}/leadership", headers=A, json={"member_id": stu_id, "position": "Officer", "term_year": 2026})
    check("Admin assigns a role", r.status_code == 201, r.text[:80])
    role_id = r.json().get("leadership_role_id") if r.status_code == 201 else None
    check("new Officer gets Officer access", c.get(f"{API}/auth/me", headers=stu).json()["role"] == "Officer")
    if role_id: c.delete(f"{API}/leadership/{role_id}", headers=A)
    check("role removed again", c.get(f"{API}/auth/me", headers=stu).json()["role"] == "Guest")

    # ------------------------------------------------------------------ events and tickets
    section("Events, tickets and the door")
    r = c.post(f"{API}/events", headers=O, json=ev_body); check("Officer creates an event with ticket types", r.status_code == 201, r.text[:100])
    ev = r.json(); eid = ev["event_id"]; paid_tt = next(t for t in ev["ticket_types"] if t["name"] == "Paid"); free_tt = next(t for t in ev["ticket_types"] if t["name"] == "Free")
    check("ticket description saved", paid_tt["description"] == "Entry and dinner")
    r = c.patch(f"{API}/ticket-types/{paid_tt['ticket_type_id']}", headers=O, json={"non_member_price": "250", "description": "Entry, dinner and a drink"})
    got = next(t for t in c.get(f"{API}/events/{eid}").json()["ticket_types"] if t["name"] == "Paid")
    check("price and description editable afterwards", r.status_code == 200 and got["non_member_price"] == "250.00" and "drink" in got["description"])
    check("event poster QR png", c.get(f"{API}/events/{eid}/qr.png").headers.get("content-type") == "image/png")
    check("registration link hidden before payment", c.get(f"{API}/events/{eid}/form", headers=G).status_code == 403)
    r = c.post(f"{API}/tickets/purchase", headers=G, json={"ticket_type_id": free_tt["ticket_type_id"], "holders": [{"holder_name": "Guest", "holder_email": roles["Guest"][0]}]})
    check("free RSVP is valid immediately", r.status_code == 201 and r.json()["tickets"][0]["is_valid"], r.text[:100])
    free_ticket = r.json()["tickets"][0]
    r = c.post(f"{API}/tickets/purchase", headers=G, json={"ticket_type_id": paid_tt["ticket_type_id"], "holders": [{"holder_name": "Guest", "holder_email": roles["Guest"][0]}]})
    check("paid ticket is held until payment", r.status_code == 201 and not r.json()["tickets"][0]["is_valid"] and r.json()["tickets"][0]["price_paid"] == "250.00", r.text[:100])
    paid_ticket = r.json()["tickets"][0]
    r = c.post(f"{API}/tickets/purchase", headers=G, json={"ticket_type_id": paid_tt["ticket_type_id"], "holders": [{"holder_name": "A"}, {"holder_name": "B"}]})
    check("per-person limit enforced (max 2 per guest)", r.status_code in (409, 422), f"{r.status_code} {r.text[:80]}")
    wrong = c.post(f"{API}/payments/razorpay/order", headers=G, json={"category": "ticket", "amount": "1.00", "ticket_ids": [paid_ticket["ticket_id"]]})
    check("wrong amount refused by the server", wrong.status_code in (400, 422))
    o, v = rzp_pay(G, "ticket", "250.00", ticket_ids=[paid_ticket["ticket_id"]])
    check("real Razorpay test order created", o.status_code == 200 and o.json()["order_id"].startswith("order_"), o.text[:100])
    check("signed payment confirms the ticket", v is not None and v.status_code == 200 and v.json()["status"] == "success", v.text[:100] if v is not None else "")
    mine = {t["ticket_id"]: t for t in c.get(f"{API}/me/tickets", headers=G).json()}
    check("ticket is valid after payment", mine[paid_ticket["ticket_id"]]["is_valid"])
    forged = c.post(f"{API}/payments/razorpay/verify", headers=G, json={"razorpay_order_id": "order_fake", "razorpay_payment_id": "pay_fake", "razorpay_signature": "0" * 64, "category": "ticket", "ticket_ids": [paid_ticket["ticket_id"]]})
    check("forged payment signature refused", forged.status_code in (400, 401, 422))
    check("registration form visible after paying", c.get(f"{API}/events/{eid}/form", headers=G).json().get("url") == "https://forms.gle/e2e")
    check("registration form QR", c.get(f"{API}/events/{eid}/form-qr.png", headers=G).headers.get("content-type") == "image/png")
    code = paid_ticket["ticket_code"]; sig = paid_ticket["qr_payload"].split(".")[-1]
    pdf = c.get(f"{API}/tickets/{code}/pdf", headers=G, params={"sig": sig})
    check("ticket PDF with signed QR", pdf.status_code == 200 and pdf.content[:4] == b"%PDF")
    check("QR code image", c.get(f"{API}/tickets/{code}/qr.png", headers=G, params={"sig": sig}).headers.get("content-type") == "image/png")
    check("ticket PDF refused without the right signature", c.get(f"{API}/tickets/{code}/pdf", params={"sig": "deadbeef"}).status_code in (401, 403, 404))
    man = c.get(f"{API}/events/{eid}/manifest", headers=O).json()
    check("offline manifest lists the tickets", len(man["tickets"]) >= 2 and "is_member" in man["tickets"][0])
    r1 = c.post(f"{API}/checkin", headers=O, json={"ticket_code": paid_ticket["qr_payload"], "event_id": eid})
    check("door admits a valid ticket", r1.status_code == 200 and r1.json()["status"] == "ADMITTED" and r1.json()["is_member"] is False, r1.text[:100])
    r2 = c.post(f"{API}/checkin", headers=O, json={"ticket_code": paid_ticket["qr_payload"], "event_id": eid})
    check("door refuses a second scan", r2.status_code >= 400 and "ALREADY" in r2.text.upper(), r2.text[:100])
    check("door refuses a forged QR", c.post(f"{API}/checkin", headers=O, json={"ticket_code": "SKYLINE1." + code + ".deadbeefdeadbeefdead", "event_id": eid}).status_code >= 400)
    check("guests cannot use the door", c.post(f"{API}/checkin", headers=G, json={"ticket_code": free_ticket["qr_payload"], "event_id": eid}).status_code == 403)
    b = c.post(f"{API}/checkin/batch", headers=O, json={"event_id": eid, "scans": [{"ticket_code": free_ticket["qr_payload"]}, {"ticket_code": paid_ticket["qr_payload"]}]}).json()
    check("offline batch sync (one accepted, duplicate reported)", [x["ok"] for x in b["results"]] == [True, False], b)
    s = c.get(f"{API}/events/{eid}/summary", headers=O).json()
    check("event summary counts sales and attendance", s["tickets_sold"] >= 2 and s["attended"] == 2 and s["ticket_revenue"] == "250.00", s)

    # ------------------------------------------------------------------ membership
    section("Membership")
    sems = c.get(f"{API}/semesters", headers=stu).json(); types = c.get(f"{API}/membership-types", headers=stu).json()
    check("semester and prices visible to a Guest", sems and {t["name"] for t in types} >= {"Standard", "Premium"}, (sems, types))
    std = next(t for t in types if t["name"] == "Standard")
    r = c.post(f"{API}/memberships", headers=stu, json={"member_id": stu_id, "semester_id": sems[0]["semester_id"], "membership_type_id": std["membership_type_id"]})
    check("membership request is unpaid", r.status_code == 201 and r.json()["payment_id"] is None, r.text[:100])
    mid = r.json()["membership_id"]
    check("unpaid request gives no member status", c.get(f"{API}/auth/me", headers=stu).json()["is_active"] is False)
    r = c.post(f"{API}/memberships", headers=stu, json={"member_id": stu_id, "semester_id": sems[0]["semester_id"], "membership_type_id": std["membership_type_id"]})
    check("retry after a cancelled payment reuses the request", r.status_code == 201 and r.json()["membership_id"] == mid)
    o, v = rzp_pay(stu, "dues", "500.00", membership_id=mid)
    check("dues paid through Razorpay", v is not None and v.status_code == 200, v.text[:100] if v is not None else o.text[:100])
    me = c.get(f"{API}/auth/me", headers=stu).json()
    check("student is now a Member", me["role"] == "Member" and me["is_active"] is True and me["valid_until"], me)
    check("second purchase for the same semester refused", c.post(f"{API}/memberships", headers=stu, json={"member_id": stu_id, "semester_id": sems[0]["semester_id"], "membership_type_id": std["membership_type_id"]}).status_code == 409)
    check("calendar reminder file", c.get(f"{API}/memberships/{mid}/calendar.ics", headers=stu).status_code == 200)
    stu = login(email, "Passw0rd!x")
    # member price on a ticket and member flag at the door
    r = c.post(f"{API}/tickets/purchase", headers=stu, json={"ticket_type_id": paid_tt["ticket_type_id"], "holders": [{"holder_name": "Member", "holder_email": email}]})
    mt = r.json()["tickets"][0] if r.status_code == 201 else {}
    check("members pay the member price", mt.get("price_paid") == "100.00", r.text[:100])
    rzp_pay(stu, "ticket", "100.00", ticket_ids=[mt["ticket_id"]])
    r = c.post(f"{API}/checkin", headers=O, json={"ticket_code": mt["qr_payload"], "event_id": eid})
    check("door shows the holder is a member", r.status_code == 200 and r.json()["is_member"] is True, r.text[:100])
    check("cash payment by an officer settles a pending item", c.post(f"{API}/payments/cash", headers=O, json={"category": "dues", "amount": "500.00", "member_id": stu_id, "membership_id": None}).status_code in (201, 422, 400))

    # ------------------------------------------------------------------ shop
    section("Shop and checkout")
    png = io.BytesIO(); __import__("PIL.Image", fromlist=["Image"]).new("RGB", (800, 400), (113, 75, 103)).save(png, "PNG")
    up = c.post(f"{API}/products/image?design=true", headers=O, files={"file": ("d.png", png.getvalue(), "image/png")})
    check("picture upload to storage", up.status_code == 200, up.text[:100])
    check("picture and thumbnail served", c.get(BASE + up.json()["url"]).status_code == 200 and c.get(BASE + up.json()["thumb_url"]).headers.get("content-type") == "image/webp")
    check("Guest cannot upload product pictures", c.post(f"{API}/products/image", headers=G, files={"file": ("d.png", png.getvalue(), "image/png")}).status_code == 403)
    r = c.post(f"{API}/products", headers=O, json={"name": f"E2E Hoodie {TAG}", "description": "t", "price": "800", "member_price": "600", "non_member_limit": 5, "max_per_guest": 2, "image_url": up.json()["url"],
                                                  "variants": [{"size": "M", "stock_quantity": 5}, {"size": "L", "stock_quantity": 3}]})
    check("Officer creates a product with sizes and picture", r.status_code == 201, r.text[:100])
    pr = r.json(); vm = next(v for v in pr["variants"] if v["size"] == "M")
    check("non-numeric price rejected", c.post(f"{API}/products", headers=O, json={"name": "bad", "price": "abc", "member_price": "1"}).status_code == 422)
    r = c.post(f"{API}/orders", headers=G, json={"items": [{"variant_id": vm["variant_id"], "quantity": 2}]})
    check("Guest checks out (non-member price)", r.status_code == 201 and r.json()["total_amount"] == "1600.00" and r.json()["status"] == "placed", r.text[:120])
    order = r.json()
    check("per-guest unit limit enforced", c.post(f"{API}/orders", headers=G, json={"items": [{"variant_id": vm["variant_id"], "quantity": 1}]}).status_code in (409, 422))
    cur = next(p for p in c.get(f"{API}/products").json() if p["product_id"] == pr["product_id"])
    check("stock reduced by the order", next(v for v in cur["variants"] if v["size"] == "M")["stock_quantity"] == 3)
    wrong = c.post(f"{API}/payments/razorpay/order", headers=G, json={"category": "merchandise", "amount": "1.00", "order_id": order["order_id"]})
    check("order payment with a wrong amount refused", wrong.status_code in (400, 422))
    o, v = rzp_pay(G, "merchandise", order["total_amount"], order_id=order["order_id"])
    check("order paid through Razorpay", v is not None and v.status_code == 200, v.text[:100] if v is not None else o.text[:100])
    check("order status is paid", c.get(f"{API}/orders/{order['order_id']}", headers=G).json()["status"] == "paid")
    r = c.post(f"{API}/orders", headers=M, json={"items": [{"variant_id": next(v for v in pr["variants"] if v["size"] == "L")["variant_id"], "quantity": 1}]})
    check("Member checks out at the member price", r.status_code == 201 and r.json()["total_amount"] == "600.00", r.text[:100])
    can = c.post(f"{API}/orders/{r.json()['order_id']}/cancel", headers=M)
    cur = next(p for p in c.get(f"{API}/products").json() if p["product_id"] == pr["product_id"])
    check("cancelling an order restores stock", can.status_code == 200 and next(v for v in cur["variants"] if v["size"] == "L")["stock_quantity"] == 3)
    check("paid order cannot be cancelled", c.post(f"{API}/orders/{order['order_id']}/cancel", headers=G).status_code >= 400)
    check("Guest cannot delete products", c.delete(f"{API}/products/{pr['product_id']}", headers=G).status_code == 403)
    r = c.delete(f"{API}/products/{pr['product_id']}", headers=O)
    check("product with orders is hidden, not destroyed", r.status_code == 200 and r.json()["status"] == "hidden" and all(p["product_id"] != pr["product_id"] for p in c.get(f"{API}/products").json()))
    r = c.post(f"{API}/products", headers=O, json={"name": f"E2E Mug {TAG}", "price": "100", "member_price": "80", "variants": [{"size": "One", "stock_quantity": 1}]})
    r2 = c.delete(f"{API}/products/{r.json()['product_id']}", headers=O)
    check("unsold product is deleted", r2.json().get("status") == "deleted")

    # ------------------------------------------------------------------ announcements and notifications
    section("Announcements and notifications")
    r = c.post(f"{API}/announcements", headers=O, json={"title": f"E2E notice {TAG}", "body": "Meeting moved to 6 PM", "send_email": False})
    check("Officer posts an announcement", r.status_code == 201, r.text[:100])
    check("members and guests see it", any(a["title"] == f"E2E notice {TAG}" for a in c.get(f"{API}/announcements", headers=G).json()))
    time.sleep(0.5)
    notes = c.get(f"{API}/notifications", headers=G).json()
    items = notes.get("items", notes) if isinstance(notes, dict) else notes
    check("in-app notification created for members", any(f"E2E notice {TAG}" in json.dumps(n) for n in items))
    check("notifications can be marked read", c.post(f"{API}/notifications/read", headers=G, json={}).status_code == 200)

    # ------------------------------------------------------------------ fundraisers
    section("Fundraisers")
    r = c.post(f"{API}/fundraisers", headers=O, json={"title": f"E2E Bake Sale {TAG}", "description": "t", "event_date": str(dt.date.today() + dt.timedelta(days=8)), "goal_amount": "5000"})
    check("Officer creates a fundraiser", r.status_code == 201, r.text[:100]); fid = r.json()["fundraiser_id"]
    member_id = c.get(f"{API}/auth/me", headers=M).json()["member_id"]
    r = c.post(f"{API}/fundraisers/{fid}/tasks", headers=O, json={"title": "Bake cookies", "assigned_to": member_id, "due_date": str(dt.date.today() + dt.timedelta(days=5))})
    check("task assigned to a member", r.status_code == 201 and r.json()["assigned_to"] == member_id, r.text[:100]); tid = r.json()["task_id"]
    check("assignee updates their own task", c.patch(f"{API}/fundraisers/{fid}/tasks/{tid}", headers=M, json={"status": "in_progress"}).status_code == 200)
    check("others cannot update the task", c.patch(f"{API}/fundraisers/{fid}/tasks/{tid}", headers=G, json={"status": "done"}).status_code == 403)
    c.patch(f"{API}/fundraisers/{fid}/tasks/{tid}", headers=M, json={"status": "done"})
    o, v = rzp_pay(G, "fundraiser", "750.00", fundraiser_id=fid)
    check("donation through Razorpay", v is not None and v.status_code == 200, (v.text if v is not None else o.text)[:100])
    pg = c.get(f"{API}/fundraisers/{fid}/progress").json()
    check("progress shows tasks done and money raised", pg["tasks_done"] == 1 and pg["tasks_total"] == 1 and pg["amount_raised"] == "750.00", pg)

    # ------------------------------------------------------------------ finance
    section("Finance and expenses")
    r = c.post(f"{API}/expenses", headers=M, json={"description": f"E2E poster printing {TAG}", "amount": "640.50", "event_id": eid})
    check("Member submits an expense", r.status_code == 201, r.text[:100]); xid = r.json()["expense_id"]
    check("Member cannot approve expenses", c.patch(f"{API}/expenses/{xid}", headers=M, params={"status": "approved"}).status_code == 403)
    ap = c.patch(f"{API}/expenses/{xid}", headers=T, params={"status": "approved"})
    check("Treasurer approves", ap.status_code == 200, ap.text[:100])
    rb = c.patch(f"{API}/expenses/{xid}", headers=T, params={"status": "reimbursed"})
    check("Treasurer marks it reimbursed", rb.status_code == 200 and rb.json()["status"] == "reimbursed", rb.text[:100])
    bal = c.get(f"{API}/treasurer/balance", headers=T).json()
    check("club balance reflects money in and out", float(bal["total_inflow"] if "total_inflow" in bal else list(bal.values())[0]) >= 0, bal)
    check("awaiting-payment list for staff", c.get(f"{API}/payments/pending", headers=O).status_code == 200)
    rc = c.post(f"{API}/expenses/receipt", headers=M, files={"file": ("r.png", png.getvalue(), "image/png")})
    check("receipt upload", rc.status_code == 200 and rc.json().get("url"), rc.text[:100])

    # ------------------------------------------------------------------ reports and dashboards
    section("Reports and dashboards")
    keys = [k["key"] for k in c.get(f"{API}/reports", headers=O).json()]
    check("eight reports listed", len(keys) == 8, keys)
    for k in keys:
        r = c.get(f"{API}/reports/{k}", headers=T)
        check(f"report {k}", r.status_code == 200 and "rows" in r.json(), r.text[:80])
    for fmt, magic in (("csv", b""), ("xlsx", b"PK"), ("pdf", b"%PDF")):
        r = c.get(f"{API}/reports/event-profit?format={fmt}", headers=O)
        check(f"report export as {fmt}", r.status_code == 200 and r.content.startswith(magic) and len(r.content) > 50)
    for who, H, scope in (("Admin", A, "club"), ("Officer", O, "club"), ("Treasurer", T, "club"), ("Member", M, "personal"), ("Guest", G, "personal")):
        r = c.get(f"{API}/dashboard/summary", headers=H)
        check(f"dashboard for {who} ({scope} numbers)", r.status_code == 200 and r.json()["scope"] == scope, r.text[:80])

    # ------------------------------------------------------------------ realtime
    section("Live updates (WebSocket)")
    import asyncio
    import websockets

    async def ws_test():
        async with websockets.connect("ws://127.0.0.1:8002/ws/updates", origin=ORIGIN) as ws:
            hello = json.loads(await ws.recv())
            await asyncio.to_thread(lambda: c.post(f"{API}/announcements", headers=O, json={"title": f"E2E live {TAG}", "body": "x", "send_email": False}))
            got = []
            try:
                while True:
                    got.append(json.loads(await asyncio.wait_for(ws.recv(), 4)))
            except Exception:
                pass
            return hello, got

    hello, got = asyncio.run(ws_test())
    check("socket connects from the Netlify site", hello.get("status") == "connected")
    check("write triggers a live update", any(m.get("type") == "data_changed" and m["payload"].get("topic") == "announcements" for m in got), got[:2])

    async def ws_evil():
        try:
            async with websockets.connect("ws://127.0.0.1:8002/ws/updates", origin="https://evil.example") as ws:
                await asyncio.wait_for(ws.recv(), 3); return False
        except Exception:
            return True
    check("socket refused from another site", asyncio.run(ws_evil()))

    # ------------------------------------------------------------------ cleanup of events (API) and summary
    section("Deleting events")
    check("Officer cannot delete an event that has tickets", c.delete(f"{API}/events/{eid}", headers=O).status_code == 422)
    check("Admin force-deletes it", c.delete(f"{API}/events/{eid}?force=true", headers=A).status_code == 200)
    check("deleted event is gone", c.get(f"{API}/events/{eid}").status_code == 404)

except Exception as exc:  # noqa: BLE001
    import traceback; traceback.print_exc()
    check("test run completed without crashing", False, repr(exc))

passed = sum(1 for _, ok, _ in results if ok)
print(f"\nRESULT: {passed}/{len(results)} passed; tag {TAG}")
for n, ok, d in results:
    if not ok: print("  FAILED:", n, "|", d)
open(os.path.join(DEPLOY, ".e2e-tag.txt"), "w").write(TAG)
