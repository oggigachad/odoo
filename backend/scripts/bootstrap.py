"""Idempotent database bootstrap for Skyline.

    python -m scripts.bootstrap                 # apply pending DDL + make sure the first Admin exists
    python -m scripts.bootstrap --reset         # ALSO wipe every other row first
    python -m scripts.bootstrap --demo-roles    # ALSO create the six @skyline.edu test accounts (dev/test only)

Real installs contain exactly one seeded account: the first Admin (ADMIN_EMAIL / ADMIN_PASSWORD, default
admin@company.com / ChangeMe@123: change it after the first login). The Admin then assigns Officer, Treasurer and
the other roles from Dashboard > Admin. Everything else is created by real users and is live.
"""

import asyncio
import datetime as dt
import os
import sys

from sqlalchemy import text

from app.core.database import async_session_factory, engine
from app.core.security import hash_password

ACCOUNTS = [
    ("Dr. Evelyn Reed", "admin@skyline.edu", "+91-90000-00001", ["Admin", "President"]),
    ("Jordan Vance", "treasurer@skyline.edu", "+91-90000-00002", ["Treasurer"]),
    ("Sophia Lin", "accountant@skyline.edu", "+91-90000-00003", ["Accountant"]),
    ("Marcus Bell", "officer@skyline.edu", "+91-90000-00004", ["Officer"]),
    ("Maya Patel", "member@skyline.edu", "+91-90000-00005", []),
    ("Taylor Scott", "guest@skyline.edu", "+91-90000-00006", []),
]

DDL = [
    "CREATE INDEX IF NOT EXISTS tickets_member_idx ON tickets (member_id)",
    "CREATE INDEX IF NOT EXISTS tickets_email_idx ON tickets (lower(holder_email))",
    "CREATE INDEX IF NOT EXISTS tickets_payment_idx ON tickets (payment_id) WHERE payment_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS payments_member_idx ON payments (member_id)",
    "CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON payments (paid_at DESC)",
    "CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)",
    "CREATE INDEX IF NOT EXISTS order_items_variant_idx ON order_items (variant_id)",
    "CREATE INDEX IF NOT EXISTS announcements_posted_idx ON announcements (posted_at DESC)",
    "CREATE INDEX IF NOT EXISTS expenses_status_idx ON expenses (status)",
    "CREATE INDEX IF NOT EXISTS events_starts_idx ON events (starts_at)",
    "CREATE INDEX IF NOT EXISTS memberships_payment_idx ON memberships (payment_id) WHERE payment_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS products_active_idx ON products (product_id) WHERE is_active",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS form_url TEXT",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT",
    "ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash TEXT",
    "ALTER TABLE members ADD COLUMN IF NOT EXISTS student_id TEXT",
    "ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS max_per_member INTEGER CHECK (max_per_member IS NULL OR max_per_member > 0)",
    "ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS max_per_guest INTEGER CHECK (max_per_guest IS NULL OR max_per_guest > 0)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS max_per_member INTEGER CHECK (max_per_member IS NULL OR max_per_member > 0)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS max_per_guest INTEGER CHECK (max_per_guest IS NULL OR max_per_guest > 0)",
    """CREATE TABLE IF NOT EXISTS notifications (
        notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        member_id       BIGINT      NOT NULL REFERENCES members (member_id) ON DELETE CASCADE,
        kind            TEXT        NOT NULL,
        title           TEXT        NOT NULL,
        body            TEXT,
        link            TEXT,
        ref             TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_at         TIMESTAMPTZ
    )""",
    "CREATE INDEX IF NOT EXISTS notifications_member_idx ON notifications (member_id, created_at DESC)",
    "CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_uq ON notifications (member_id, kind, ref) WHERE ref IS NOT NULL",
]

TABLES = (
    "order_items, orders, tickets, ticket_types, events, announcements, expenses, fundraiser_tasks, "
    "fundraisers, memberships, payments, membership_types, semesters, product_variants, products, "
    "leadership_roles, notifications, members"
)


def current_semester(today: dt.date) -> tuple[str, dt.date, dt.date]:
    if today.month >= 8:
        return f"Fall {today.year}", dt.date(today.year, 8, 1), dt.date(today.year, 12, 31)
    return f"Spring {today.year}", dt.date(today.year, 1, 1), dt.date(today.year, 7, 31)


async def main(reset: bool, demo: bool) -> None:
    password = os.environ.get("SEED_PASSWORD", "password123")
    accounts = list(ACCOUNTS) if demo else [
        ("Club Admin", os.environ.get("ADMIN_EMAIL", "admin@company.com").lower(), None, ["Admin"])
    ]
    if not demo:
        password = os.environ.get("ADMIN_PASSWORD", "ChangeMe@123")
    today = dt.date.today()
    async with async_session_factory() as s:
        for stmt in DDL:
            await s.execute(text(stmt))
        if reset:
            await s.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))

        ids: dict[str, int] = {}
        for name, email, phone, roles in accounts:
            row = (await s.execute(text("SELECT member_id FROM members WHERE LOWER(email)=:e"), {"e": email})).first()
            if row:
                mid = row[0]
                await s.execute(
                    text("UPDATE members SET full_name=:n, phone=:p, password_hash=:h WHERE member_id=:i"),
                    {"n": name, "p": phone, "h": hash_password(password), "i": mid},
                )
            else:
                mid = (
                    await s.execute(
                        text(
                            "INSERT INTO members (full_name, email, phone, password_hash) "
                            "VALUES (:n,:e,:p,:h) RETURNING member_id"
                        ),
                        {"n": name, "e": email, "p": phone, "h": hash_password(password)},
                    )
                ).scalar_one()
            ids[email] = mid
            for role in roles:
                await s.execute(
                    text(
                        "INSERT INTO leadership_roles (member_id, position, term_year) VALUES (:m,:r,:y) "
                        "ON CONFLICT (member_id, position, term_year) DO NOTHING"
                    ),
                    {"m": mid, "r": role, "y": today.year},
                )

        if demo:
            # The seeded Member account needs an active membership to resolve to the 'Member' access level.
            sem = (
                await s.execute(text("SELECT semester_id FROM semesters WHERE starts_on <= :t AND ends_on >= :t"), {"t": today})
            ).first()
            if not sem:
                name, a, b = current_semester(today)
                sem_id = (
                    await s.execute(
                        text("INSERT INTO semesters (name, starts_on, ends_on) VALUES (:n,:a,:b) RETURNING semester_id"),
                        {"n": name, "a": a, "b": b},
                    )
                ).scalar_one()
            else:
                sem_id = sem[0]
            mt = (await s.execute(text("SELECT membership_type_id, dues_amount FROM membership_types ORDER BY 1 LIMIT 1"))).first()
            if not mt:
                mt = (
                    await s.execute(
                        text(
                            "INSERT INTO membership_types (name, dues_amount, is_offered) "
                            "VALUES ('Standard Student Membership', 500.00, TRUE) RETURNING membership_type_id, dues_amount"
                        )
                    )
                ).first()
            maya = ids["member@skyline.edu"]
            has = (
                await s.execute(
                    text("SELECT 1 FROM memberships WHERE member_id=:m AND semester_id=:s"), {"m": maya, "s": sem_id}
                )
            ).first()
            if not has:
                pay_id = (
                    await s.execute(
                        text(
                            "INSERT INTO payments (member_id, category, amount, method) "
                            "VALUES (:m,'dues',:a,'cash') RETURNING payment_id"
                        ),
                        {"m": maya, "a": mt[1]},
                    )
                ).scalar_one()
                await s.execute(
                    text(
                        "INSERT INTO memberships (member_id, semester_id, membership_type_id, dues_amount, payment_id) "
                        "VALUES (:m,:s,:t,:a,:p)"
                    ),
                    {"m": maya, "s": sem_id, "t": mt[0], "a": mt[1], "p": pay_id},
                )
        await s.commit()
    await engine.dispose()
    print(("Reset + " if reset else "") + ("bootstrap complete: 6 demo role accounts ready." if demo else f"bootstrap complete: Admin {accounts[0][1]} ready."))


if __name__ == "__main__":
    asyncio.run(main("--reset" in sys.argv, "--demo-roles" in sys.argv))
