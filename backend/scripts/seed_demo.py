"""Add a believable demo club on top of whatever is already in the database. Nothing is ever overwritten or deleted.

    python -m scripts.seed_demo              # add the demo data (refuses to run twice)
    python -m scripts.seed_demo --remove     # take exactly the rows it added back out again

Every row it creates is recorded in scripts/.demo_ids.json, so --remove deletes only those rows. Demo members have no
password, so nobody can sign in as them. Product pictures are drawn here and stored in MinIO (it must be running).
"""

import asyncio
import datetime as dt
import io
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
from sqlalchemy import text

from app.core.database import async_session_factory, engine
from app.services.storage import make_thumbnail, save_media

IDS = Path(__file__).resolve().parent / ".demo_ids.json"
LOGO = Path(__file__).resolve().parents[2] / "frontend" / "public" / "logo.png"
rnd = random.Random(2026)
NOW = dt.datetime.now(dt.timezone.utc)
TODAY = NOW.date()

NAMES = [
    "Aarav Mehta", "Diya Sharma", "Kabir Singh", "Ishita Rao", "Rohan Gupta", "Ananya Iyer", "Vihaan Nair",
    "Meera Joshi", "Arjun Kapoor", "Sneha Pillai", "Dev Malhotra", "Tara Menon", "Yash Bansal", "Riya Das",
]
GUESTS = ["Neha Verma", "Karan Oberoi", "Pooja Hegde", "Sahil Khanna"]


# ----------------------------------------------------------------------------- pictures
def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


SHAPES = {
    "tshirt": [(130, 40), (60, 80), (20, 150), (75, 175), (95, 150), (95, 360), (305, 360), (305, 150), (325, 175), (380, 150), (340, 80), (270, 40), (240, 62), (200, 70), (160, 62)],
    "hoodie": [(140, 50), (60, 90), (15, 310), (78, 325), (100, 190), (100, 360), (300, 360), (300, 190), (322, 325), (385, 310), (340, 90), (260, 50), (230, 78), (200, 84), (170, 78)],
    "tote": [(70, 130), (330, 130), (345, 370), (55, 370)],
    "cap": [(70, 250), (80, 170), (130, 110), (200, 90), (270, 110), (320, 170), (330, 250), (390, 275), (390, 300), (60, 300), (60, 275)],
    "notebook": [(110, 50), (300, 50), (300, 360), (110, 360)],
}


def mockup(kind: str, color: str, label: str, ink: str = "#ffffff", back: bool = False) -> bytes:
    """A clean product picture: soft gradient backdrop, garment silhouette, club logo and wordmark. Front and back side by side."""
    w = 400
    img = Image.new("RGB", (w * (2 if kind != "notebook" else 1), w), "#f4f1f4")
    for pane in range(2 if kind != "notebook" else 1):
        d = ImageDraw.Draw(img)
        ox = pane * w
        for y in range(w):  # vertical gradient
            t = y / w
            d.line([(ox, y), (ox + w, y)], fill=(int(246 - 18 * t), int(242 - 22 * t), int(246 - 12 * t)))
        shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.polygon([(x + ox + 6, y + 10) for x, y in SHAPES[kind]], fill=(60, 30, 55, 70))
        img.paste(shadow, (0, 0), shadow)
        d = ImageDraw.Draw(img)
        pts = [(x + ox, y) for x, y in SHAPES[kind]]
        d.polygon(pts, fill=color, outline="#00000030")
        if kind == "hoodie":
            d.ellipse([ox + 150, 52, ox + 250, 96], fill="#00000020")
            if pane == 0:
                d.rectangle([ox + 140, 290, ox + 260, 345], outline="#00000040", width=2)
        if kind == "cap":
            d.ellipse([ox + 188, 92, ox + 212, 110], fill="#00000030")
        if kind == "tote":
            d.arc([ox + 125, 40, ox + 275, 220], 200, 340, fill="#00000070", width=7)
        if kind == "notebook":
            d.rectangle([ox + 110, 50, ox + 128, 360], fill="#00000028")
        cy = {"tshirt": 190, "hoodie": 215, "tote": 250, "cap": 215, "notebook": 205}[kind]
        if pane == 0 or kind == "notebook":
            if LOGO.exists() and ink == "#ffffff":  # the logo is white artwork: only on dark items
                logo = Image.open(LOGO).convert("RGBA")
                logo = ImageOps.contain(logo, (150, 46))
                img.paste(logo, (ox + 200 - logo.width // 2, cy - 30), logo)
            f = _font(26)
            tw = d.textlength(label, font=f)
            d.text((ox + 200 - tw / 2, cy + 22), label, font=f, fill=ink)
        else:
            f = _font(34)
            tw = d.textlength("SKYLINE", font=f)
            d.text((ox + 200 - tw / 2, cy - 40), "SKYLINE", font=f, fill=ink)
            f2 = _font(15)
            tw = d.textlength("STUDENT ASSOCIATION", font=f2)
            d.text((ox + 200 - tw / 2, cy), "STUDENT ASSOCIATION", font=f2, fill=ink)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def upload(kind: str, color: str, label: str, ink: str, key: str) -> str:
    data = mockup(kind, color, label, ink)
    url = await save_media(f"products/{key}.png", data, "image/png")
    await save_media(f"products/t_{key}.webp", make_thumbnail(data, design=kind != "notebook"), "image/webp")
    return url


# ----------------------------------------------------------------------------- data
async def seed() -> None:
    if IDS.exists():
        print("Demo data was already added (scripts/.demo_ids.json exists). Run with --remove first to re-create it.")
        return
    ids: dict[str, list[int]] = {k: [] for k in (
        "members", "payments", "memberships", "semesters", "membership_types", "events", "ticket_types", "tickets", "products",
        "variants", "orders", "announcements", "fundraisers", "tasks", "expenses")}
    async with async_session_factory() as db:
        async def one(sql: str, **p):  # type: ignore[no-untyped-def]
            return (await db.execute(text(sql), p)).scalar_one()

        admin = (await db.execute(text("SELECT member_id FROM members ORDER BY member_id LIMIT 1"))).scalar_one_or_none()
        if admin is None:
            print("No members exist yet. Run `python -m scripts.bootstrap` first.")
            return

        # --- members (no password: they cannot sign in)
        members: list[int] = []
        for i, name in enumerate(NAMES + GUESTS):
            email = f"{name.lower().replace(' ', '.')}@student.edu.in"
            exists = (await db.execute(text("SELECT 1 FROM members WHERE email=:e"), {"e": email})).first()
            if exists:
                continue
            mid = await one(
                "INSERT INTO members (full_name,email,phone,joined_on,student_id) VALUES (:n,:e,:p,:j,:s) RETURNING member_id",
                n=name, e=email, p=f"+91 9{rnd.randint(100000000, 999999999)}", j=TODAY - dt.timedelta(days=rnd.randint(5, 140)), s=f"DEMO/CS/2026-{i + 1:02d}")
            members.append(mid)
            ids["members"].append(mid)
        students, guests = members[: len(NAMES)], members[len(NAMES):]

        # --- semester and membership types (reuse what the club already has)
        sem = (await db.execute(text(
            "SELECT semester_id, starts_on FROM semesters WHERE ends_on >= CURRENT_DATE - 1 ORDER BY (CURRENT_DATE BETWEEN starts_on AND ends_on) DESC, starts_on LIMIT 1"))).first()
        if sem:
            sem_id, sem_start = sem
        else:
            sem_id = await one("INSERT INTO semesters (name,starts_on,ends_on) VALUES (:n,:s,:e) RETURNING semester_id",
                               n=f"Demo semester {TODAY.year}", s=TODAY - dt.timedelta(days=60), e=TODAY + dt.timedelta(days=100))
            ids["semesters"].append(sem_id)
            sem_start = TODAY - dt.timedelta(days=60)
        types: dict[str, int] = {}
        for name, dues in (("Standard", 500), ("Premium", 900)):
            row = (await db.execute(text("SELECT membership_type_id FROM membership_types WHERE name=:n"), {"n": name})).first()
            if row:
                types[name] = row[0]
            else:
                types[name] = await one("INSERT INTO membership_types (name,dues_amount,is_offered) VALUES (:n,:d,true) RETURNING membership_type_id", n=name, d=dues)
                ids["membership_types"].append(types[name])

        async def pay(member: int | None, category: str, amount: float, method: str, when: dt.datetime, fundraiser: int | None = None) -> int:
            pid = await one(
                "INSERT INTO payments (member_id,category,amount,method,paid_at,fundraiser_id,external_ref) VALUES (:m,:c,:a,:me,:w,:f,:x) RETURNING payment_id",
                m=member, c=category, a=amount, me=method, w=when, f=fundraiser, x=f"demo_{rnd.randint(10**8, 10**9)}" if method == "online" else None)
            ids["payments"].append(pid)
            return pid

        def ago(days: int, hour: int = 11) -> dt.datetime:
            return (NOW - dt.timedelta(days=days)).replace(hour=hour, minute=rnd.randint(0, 59), second=0, microsecond=0)

        # --- memberships: most paid, a couple still pending
        member_set: list[int] = []
        for i, mid in enumerate(students):
            tname = "Premium" if i % 4 == 0 else "Standard"
            dues = 900 if tname == "Premium" else 500
            pid = None
            if i < 10:
                pid = await pay(mid, "dues", dues, "online" if i % 3 else "cash", ago(rnd.randint(2, 50)))
                member_set.append(mid)
            msid = await one(
                "INSERT INTO memberships (member_id,semester_id,membership_type_id,dues_amount,payment_id) VALUES (:m,:s,:t,:d,:p) RETURNING membership_id",
                m=mid, s=sem_id, t=types[tname], d=dues, p=pid)
            ids["memberships"].append(msid)

        # --- events and tickets
        async def event(title: str, desc: str, venue: str, when: dt.datetime, tts: list[tuple]) -> tuple[int, list[tuple[int, float, float]]]:
            eid = await one("INSERT INTO events (title,description,venue,starts_at) VALUES (:t,:d,:v,:w) RETURNING event_id", t=title, d=desc, v=venue, w=when)
            ids["events"].append(eid)
            out = []
            for name, tdesc, mp, np_, seats, nm_seats in tts:
                tid = await one(
                    "INSERT INTO ticket_types (event_id,name,description,member_price,non_member_price,seat_limit,non_member_seat_limit,max_per_member,max_per_guest) "
                    "VALUES (:e,:n,:d,:mp,:np,:s,:ns,4,2) RETURNING ticket_type_id", e=eid, n=name, d=tdesc, mp=mp, np=np_, s=seats, ns=nm_seats)
                ids["ticket_types"].append(tid)
                out.append((tid, mp, np_))
            return eid, out

        async def sell(tt: tuple[int, float, float], buyer: int, is_member: bool, bought: dt.datetime, attended: bool, door: int) -> None:
            tid, mp, np_ = tt
            price = mp if is_member else np_
            row = (await db.execute(text("SELECT full_name,email FROM members WHERE member_id=:m"), {"m": buyer})).first()
            pid = await pay(buyer, "ticket", price, "online", bought) if price > 0 else None
            tk = await one(
                "INSERT INTO tickets (ticket_type_id,member_id,holder_name,holder_email,price_paid,payment_id,purchased_at,checked_in_at,checked_in_by) "
                "VALUES (:t,:m,:n,:e,:p,:pid,:w,:ci,:cb) RETURNING ticket_id",
                t=tid, m=buyer if is_member else None, n=row[0], e=row[1], p=price, pid=pid, w=bought,
                ci=(bought + dt.timedelta(days=3)) if attended else None, cb=door if attended else None)
            ids["tickets"].append(tk)

        past_id, past_tt = await event(
            "Welcome Mixer", "Meet the committee, find your people and pick up your membership card.", "Student Centre, Hall B",
            NOW - dt.timedelta(days=21), [("General", "Entry, snacks and a welcome drink", 0, 150, 60, 25)])
        for i, mid in enumerate(students[:9]):
            await sell(past_tt[0], mid, mid in member_set, ago(rnd.randint(24, 30)), i != 8, admin)
        for g in guests[:3]:
            await sell(past_tt[0], g, False, ago(rnd.randint(22, 26)), True, admin)

        hack_id, hack_tt = await event(
            "Hack Night 24h", "Build something in 24 hours. Teams of up to four, mentors on site, pizza at midnight.", "Engineering Block, Lab 3",
            NOW + dt.timedelta(days=9, hours=4), [("Team member", "24 hours of building, meals included", 200, 400, 80, 30)])
        for mid in students[:6]:
            await sell(hack_tt[0], mid, mid in member_set, ago(rnd.randint(1, 6)), False, admin)
        await sell(hack_tt[0], guests[0], False, ago(2), False, admin)

        gala_id, gala_tt = await event(
            "Spring Gala", "The club's biggest night: live band, dinner and the annual awards.", "Grand Ballroom, City Hotel",
            NOW + dt.timedelta(days=24, hours=8), [
                ("General", "Entry, dinner and a drink", 600, 900, 150, 50),
                ("VIP table", "Front tables, welcome cocktail and a photo booth pass", 1200, 1800, 30, 10)])
        for mid in students[:7]:
            await sell(gala_tt[0], mid, mid in member_set, ago(rnd.randint(1, 9)), False, admin)
        await sell(gala_tt[1], students[1], students[1] in member_set, ago(3), False, admin)
        await sell(gala_tt[0], guests[1], False, ago(1), False, admin)

        await event("Resume Workshop", "Bring a draft; leave with a better one. Free for everyone.", "Library, Room 12",
                    NOW + dt.timedelta(days=3, hours=6), [("Free RSVP", "Free entry, limited seats", 0, 0, 40, 40)])

        # --- merchandise
        catalogue = [
            ("Club Hoodie", "Heavyweight fleece hoodie with the Skyline crest. Runs true to size.", 1799, 1499, "hoodie", "#714B67", "#ffffff", "HOODIE", {"S": 14, "M": 22, "L": 18, "XL": 8}),
            ("Classic Tee", "Soft cotton T-shirt, club logo on the chest and wordmark on the back.", 799, 599, "tshirt", "#f2efe9", "#2b1a27", "CLASSIC TEE", {"S": 20, "M": 30, "L": 25, "XL": 10}),
            ("Campus Tote", "Canvas tote that fits a laptop and a week of lectures.", 499, 399, "tote", "#d9c7a3", "#2b1a27", "CAMPUS TOTE", {"One size": 45}),
            ("Skyline Cap", "Six-panel cap with an adjustable strap.", 549, 449, "cap", "#1f2a44", "#ffffff", "SKYLINE", {"One size": 32}),
            ("Notebook", "A5 dotted notebook, 160 pages, lay-flat binding.", 299, 229, "notebook", "#714B67", "#ffffff", "NOTES", {"A5": 60}),
        ]
        sizes: dict[str, list[tuple[int, float, float]]] = {}
        for name, desc, price, mprice, kind, color, ink, label, stock in catalogue:
            key = f"demo_{kind}"
            url = await upload(kind, color, label, ink, key)
            pid = await one(
                "INSERT INTO products (name,description,price,member_price,non_member_limit,max_per_member,max_per_guest,image_url) "
                "VALUES (:n,:d,:p,:mp,40,5,2,:u) RETURNING product_id", n=name, d=desc, p=price, mp=mprice, u=url)
            ids["products"].append(pid)
            sizes[name] = []
            for size, qty in stock.items():
                vid = await one("INSERT INTO product_variants (product_id,size,stock_quantity) VALUES (:p,:s,:q) RETURNING variant_id", p=pid, s=size, q=qty)
                ids["variants"].append(vid)
                sizes[name].append((vid, price, mprice))
        order_plan = [
            ("Club Hoodie", 1, 1), ("Club Hoodie", 2, 1), ("Classic Tee", 1, 2), ("Classic Tee", 2, 1), ("Campus Tote", 0, 1),
            ("Skyline Cap", 0, 1), ("Notebook", 0, 3), ("Club Hoodie", 3, 1), ("Classic Tee", 2, 2), ("Notebook", 0, 2),
        ]
        for n, (pname, vi, qty) in enumerate(order_plan):
            buyer = students[n % len(students)]
            is_m = buyer in member_set
            vid, price, mprice = sizes[pname][vi]
            unit = mprice if is_m else price
            paid = n % 5 != 4
            pid = await pay(buyer, "merchandise", unit * qty, "online", ago(rnd.randint(1, 30))) if paid else None
            row = (await db.execute(text("SELECT full_name,email FROM members WHERE member_id=:m"), {"m": buyer})).first()
            oid = await one(
                "INSERT INTO orders (member_id,buyer_name,buyer_email,ordered_at,status,payment_id) VALUES (:m,:n,:e,:w,:s,:p) RETURNING order_id",
                m=buyer if is_m else None, n=row[0], e=row[1], w=ago(rnd.randint(1, 30)), s="paid" if paid else "placed", p=pid)
            ids["orders"].append(oid)
            await db.execute(text("INSERT INTO order_items (order_id,variant_id,quantity,unit_price) VALUES (:o,:v,:q,:u)"), {"o": oid, "v": vid, "q": qty, "u": unit})
            await db.execute(text("UPDATE product_variants SET stock_quantity = GREATEST(stock_quantity - :q, 0) WHERE variant_id=:v"), {"q": qty, "v": vid})

        # --- announcements
        for title, body, days in (
            ("Welcome back, Skyline", "Memberships are open for the new semester. Pay dues from the Membership tab to unlock member prices on tickets and merchandise.", 18),
            ("Hack Night registrations are open", "24 hours, teams of up to four, mentors on site. Seats are limited, so grab your ticket from the Events tab.", 6),
            ("Hoodie pre-orders close this Friday", "Sizes S to XL are in stock. Members pay less, and every order is paid online or in cash at the desk.", 4),
            ("Spring Gala tickets are live", "General and VIP tables are on sale. Show the QR on your ticket at the door; no printed list needed.", 2),
        ):
            aid = await one("INSERT INTO announcements (title,body,posted_by,posted_at) VALUES (:t,:b,:p,:w) RETURNING announcement_id", t=title, b=body, p=admin, w=ago(days, 10))
            ids["announcements"].append(aid)

        # --- fundraisers with tasks and donations
        async def fundraiser(title: str, desc: str, goal: int, days: int, tasks: list[tuple[str, str, int, int]], donors: list[tuple[int, int]]) -> int:
            fid = await one("INSERT INTO fundraisers (title,description,event_date,goal_amount) VALUES (:t,:d,:e,:g) RETURNING fundraiser_id",
                            t=title, d=desc, e=TODAY + dt.timedelta(days=days), g=goal)
            ids["fundraisers"].append(fid)
            for ttitle, tdesc, who, state in tasks:
                tk = await one(
                    "INSERT INTO fundraiser_tasks (fundraiser_id,title,description,assigned_to,status,due_date) VALUES (:f,:t,:d,:a,:s,:du) RETURNING task_id",
                    f=fid, t=ttitle, d=tdesc, a=students[who], s=("todo", "in_progress", "done")[state], du=TODAY + dt.timedelta(days=max(days - 2, 1)))
                ids["tasks"].append(tk)
            for who, amount in donors:
                await pay(students[who], "fundraiser", amount, "online", ago(rnd.randint(1, 12)), fid)
            return fid

        bake_id = await fundraiser(
            "Campus Bake Sale", "Cakes, cookies and chai to fund the Spring Gala sound system.", 15000, 12,
            [("Bake the cookies", "Three batches, nut-free", 2, 2), ("Buy supplies", "Flour, sugar, cups and napkins", 3, 2),
             ("Book the table", "Student Centre foyer, 10am to 4pm", 4, 1), ("Make the posters", "A3, two of them", 5, 0),
             ("Run the stall", "Two-hour shifts, sign up in the group", 6, 0)],
            [(0, 1500), (1, 500), (2, 1000), (3, 750), (4, 2000), (5, 300), (7, 1200)])
        drive_id = await fundraiser(
            "Hoodie Drive", "Pre-sell the next hoodie batch to cover the print run.", 40000, 20,
            [("Collect size preferences", "Poll in the group", 8, 2), ("Get a print quote", "Two suppliers", 9, 1), ("Confirm the order", "Pay the deposit", 10, 0)],
            [(1, 2500), (6, 1800), (9, 3000)])

        # --- expenses (money out), some reimbursed
        for who, desc, amount, status, ev, fr, days in (
            (3, "Poster printing for Welcome Mixer", 640.00, "reimbursed", past_id, None, 28),
            (4, "Snacks and drinks for the mixer", 2850.00, "reimbursed", past_id, None, 22),
            (5, "Bake sale ingredients", 1320.50, "approved", None, bake_id, 5),
            (2, "Table cloth and cups", 410.00, "submitted", None, bake_id, 3),
            (6, "Hack Night banner", 980.00, "submitted", hack_id, None, 2),
            (7, "Sound check rental (Gala)", 3500.00, "approved", gala_id, None, 4),
            (9, "Cab fare to supplier", 260.00, "rejected", None, drive_id, 7),
        ):
            reimbursed = ago(days - 1) if status == "reimbursed" else None
            xid = await one(
                "INSERT INTO expenses (member_id,description,amount,event_id,fundraiser_id,incurred_on,submitted_at,status,reimbursed_at) "
                "VALUES (:m,:d,:a,:e,:f,:i,:s,:st,:r) RETURNING expense_id",
                m=students[who], d=desc, a=amount, e=ev, f=fr, i=TODAY - dt.timedelta(days=days), s=ago(days), st=status, r=reimbursed)
            ids["expenses"].append(xid)

        await db.commit()
    IDS.write_text(json.dumps(ids))
    print("Demo data added:", {k: len(v) for k, v in ids.items() if v})


async def remove() -> None:
    if not IDS.exists():
        print("Nothing to remove (scripts/.demo_ids.json not found).")
        return
    ids = json.loads(IDS.read_text())
    order = [
        ("order_items", "order_id", "orders"), ("orders", "order_id", "orders"), ("expenses", "expense_id", "expenses"),
        ("fundraiser_tasks", "task_id", "tasks"), ("tickets", "ticket_id", "tickets"), ("memberships", "membership_id", "memberships"),
        ("announcements", "announcement_id", "announcements"), ("ticket_types", "ticket_type_id", "ticket_types"),
        ("events", "event_id", "events"), ("product_variants", "variant_id", "variants"), ("products", "product_id", "products"),
        ("payments", "payment_id", "payments"), ("fundraisers", "fundraiser_id", "fundraisers"), ("semesters", "semester_id", "semesters"),
        ("membership_types", "membership_type_id", "membership_types"), ("members", "member_id", "members"),
    ]
    async with async_session_factory() as db:
        for table, col, key in order:
            if ids.get(key):
                await db.execute(text(f"DELETE FROM {table} WHERE {col} = ANY(:ids)"), {"ids": ids[key]})
        await db.commit()
    IDS.unlink()
    print("Demo data removed.")


async def main() -> None:
    try:
        await (remove() if "--remove" in sys.argv else seed())
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
