"""Create one working login per role (Admin already exists), the current semester and the membership prices.

    python -m scripts.role_accounts                 # create what is missing, print new passwords ONCE
    python -m scripts.role_accounts --reset         # also give every listed account a NEW password

Idempotent: existing accounts keep their password unless --reset is given. Passwords are random and printed only here;
write them down (or save the output) and change them from Settings after the first sign-in. Nothing is shown on the website.

Accounts (e-mail domains follow the sign-up rules in the settings):
    treasurer@company.com   Treasurer      officer@company.com   Officer
    member@student.edu.in   Member (paid dues for the current semester)      guest@student.edu.in   Guest
"""

import asyncio
import datetime as dt
import secrets
import sys

from sqlalchemy import text

from app.core.database import async_session_factory, engine
from app.core.security import hash_password

ACCOUNTS = [
    ("Club Treasurer", "treasurer@company.com", ["Treasurer"]),
    ("Club Officer", "officer@company.com", ["Officer"]),
    ("Club Member", "member@student.edu.in", []),
    ("Club Guest", "guest@student.edu.in", []),
]
SEMESTER = ("Fall 2026", dt.date(2026, 8, 1), dt.date(2027, 1, 31))
TYPES = [("Standard", 500), ("Premium", 900)]


async def main(reset: bool) -> None:
    today = dt.date.today()
    async with async_session_factory() as s:
        # semester and membership prices (what the Membership tab shows)
        row = (await s.execute(text("SELECT semester_id FROM semesters WHERE name=:n"), {"n": SEMESTER[0]})).first()
        if row:
            sem_id = row[0]
        else:
            covering = (await s.execute(text("SELECT semester_id FROM semesters WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1"))).first()
            sem_id = covering[0] if covering else (await s.execute(
                text("INSERT INTO semesters (name, starts_on, ends_on) VALUES (:n,:a,:b) RETURNING semester_id"),
                {"n": SEMESTER[0], "a": SEMESTER[1], "b": SEMESTER[2]})).scalar_one()
            print("semester ready:", SEMESTER[0])
        type_ids = {}
        for name, dues in TYPES:
            row = (await s.execute(text("SELECT membership_type_id FROM membership_types WHERE name=:n"), {"n": name})).first()
            type_ids[name] = row[0] if row else (await s.execute(
                text("INSERT INTO membership_types (name, dues_amount, is_offered) VALUES (:n,:d,true) RETURNING membership_type_id"),
                {"n": name, "d": dues})).scalar_one()

        print("\nACCOUNT                    ROLE        PASSWORD")
        for full_name, email, roles in ACCOUNTS:
            row = (await s.execute(text("SELECT member_id FROM members WHERE LOWER(email)=:e"), {"e": email})).first()
            password = None
            if row is None:
                password = secrets.token_urlsafe(9)
                mid = (await s.execute(text("INSERT INTO members (full_name,email,password_hash) VALUES (:n,:e,:h) RETURNING member_id"),
                                       {"n": full_name, "e": email, "h": hash_password(password)})).scalar_one()
            else:
                mid = row[0]
                if reset:
                    password = secrets.token_urlsafe(9)
                    await s.execute(text("UPDATE members SET password_hash=:h WHERE member_id=:m"), {"h": hash_password(password), "m": mid})
            for role in roles:
                await s.execute(text("INSERT INTO leadership_roles (member_id, position, term_year) VALUES (:m,:r,:y) ON CONFLICT DO NOTHING"),
                                {"m": mid, "r": role, "y": today.year})
            if email.startswith("member@"):
                have = (await s.execute(text("SELECT 1 FROM memberships WHERE member_id=:m AND semester_id=:s"), {"m": mid, "s": sem_id})).first()
                if not have:
                    pid = (await s.execute(text("INSERT INTO payments (member_id, category, amount, method) VALUES (:m,'dues',500,'cash') RETURNING payment_id"),
                                           {"m": mid})).scalar_one()
                    await s.execute(text("INSERT INTO memberships (member_id, semester_id, membership_type_id, dues_amount, payment_id) VALUES (:m,:s,:t,500,:p)"),
                                    {"m": mid, "s": sem_id, "t": type_ids["Standard"], "p": pid})
            role = roles[0] if roles else ("Member" if email.startswith("member@") else "Guest")
            print(f"{email:<26} {role:<11} {password or '(existing, unchanged)'}")
        await s.commit()
    print("\nAdmin is the account created at first start (ADMIN_EMAIL / ADMIN_PASSWORD).")


async def run() -> None:
    try:
        await main("--reset" in sys.argv)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
