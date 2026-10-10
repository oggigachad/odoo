# Skyline Student Association Platform

One system for a student club's **events, members and money**: sign-ups and dues, ticketing with signed QR codes and an offline door scanner, a merchandise shop with a design studio, fundraiser task boards, announcements, expense reimbursement, and eight exportable finance reports. Runs as a website and an installable phone app (PWA).

| | |
| :--- | :--- |
| Backend | FastAPI (Python 3.13), SQLAlchemy 2 + asyncpg, PostgreSQL 16, Redis 7, MinIO, Razorpay |
| Frontend | React 19 + TypeScript, Vite, Tailwind v4, PWA |
| Roles | Admin, Treasurer/Accountant, Officer, Member, Guest (decided by the server on every request) |

## Quick start

You need Docker Desktop, Python 3.13 and Node 20+.

```bash
# 1. Databases and storage (PostgreSQL, Redis on 127.0.0.1:6380, MinIO)
docker compose up -d

# 2. Backend
cd backend
pip install -r requirements.txt
cp ../.env.example .env            # then fill in the values (see below). Use 127.0.0.1, not localhost, in database URLs (Windows tries IPv6 first and every connection stalls ~2 s)
python -m scripts.bootstrap        # creates tables, indexes and the first Admin
python -m uvicorn app.main:app --port 8000

# 3. Frontend (second terminal)
cd frontend
npm install
npm run dev                        # http://localhost:3000
```

API reference (development only): http://localhost:8000/docs

Sign in as the first Admin with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env` (defaults `admin@company.com` / `ChangeMe@123`) and **change the password at once** in Settings. Staff then sign up with a staff-domain address and an emailed code; the Admin assigns Officer and Treasurer roles under Dashboard > Admin.

## Configuration (`backend/.env`)

| Setting | Purpose |
| :--- | :--- |
| `DATABASE_URL`, `REDIS_URL` | PostgreSQL and Redis (Redis needs its password; the Docker one is on port 6380) |
| `JWT_SECRET`, `TICKET_SIGNING_SECRET` | Two separate random secrets, 32+ characters. Required |
| `STUDENT_EMAIL_DOMAINS`, `ADMIN_EMAIL_DOMAINS` | Who may sign up (students: `gmail.com,student.edu.in`; staff: `company.com,company.in`) |
| `SMTP_*`, `SMTP2_*` | Sending mail (Gmail needs an App Password; port 465 works where 587 is blocked). `SMTP2_*` is the backup mailbox |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Online payments (test keys work); webhook URL `<api>/api/v1/webhooks/razorpay` |
| `MINIO_*` | Product pictures (required) |
| `GOOGLE_CLIENT_ID` | Google sign-in for existing accounts; also set `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` |
| `FRONTEND_URL` | Public site address. Event poster QR codes point here, so use your LAN IP or domain, not `localhost` |
| `APP_ENV` | `development`, or `production` (hides API docs, never echoes login codes, requires HTTPS cookies) |

Never commit `.env`; it is git-ignored.

## Demo data (optional)

```bash
cd backend
python -m scripts.seed_demo            # adds a demo club: members, events with tickets, 5 merchandise items, orders, fundraisers, expenses
python -m scripts.seed_demo --remove   # removes exactly what it added
```

It only adds rows and never overwrites your data. Demo members have no password.

## Tests

```bash
cd backend && python -m pytest -q      # 44 tests, isolated skyline_test database and Redis db 1
cd frontend && npx tsc --noEmit        # type-check
```

Create the test database once: `docker exec skyline_postgres createdb -U skyline_admin skyline_test`, then load `database/schema.sql` and run `python -m scripts.bootstrap` against it (set `DATABASE_URL` for that run).

## Project layout

```
backend/app/api/v1/      routes (auth, events, shop, finance, reports, fundraisers, ...)
backend/app/services/    business logic (payments, tickets, storage, report export)
backend/app/jobs/        email worker, membership and event reminders, hold cleanup
backend/scripts/         bootstrap.py, seed_demo.py, send_test_email.py
backend/tests/           pytest suite
database/schema.sql      tables, triggers, views, indexes
frontend/src/            app, panels per feature, components, offline check-in
docker-compose.yml       PostgreSQL, Redis, MinIO
```

## Deploying

`DEPLOY.md` is the step-by-step production guide: the site on Vercel or Netlify (`frontend/vercel.json`, `frontend/netlify.toml`), the API with PostgreSQL, Redis and MinIO on one Docker server with automatic HTTPS (`deploy/`).

## More documentation

- `PROJECT_REPORT.md` is the full report from zero to production: design, architecture, crucial code explained, bugs and lessons, deployment and operations.
- `STUDENT_ORGANIZATION_SYSTEM_A_TO_Z.md` is the full guide: architecture, roles, schema, modules, generated API reference and production notes.
- `WEBSITE_STATUS.md` is the change log and the "Current state" of what was verified.
- `ISSUES.md` is the issue history and the security review.

## Before going live

Set strong secrets, change every default password (Admin, MinIO, PostgreSQL, Redis), set `APP_ENV=production`, serve over HTTPS (the phone camera scanner needs it), use live Razorpay keys, and back up PostgreSQL and the MinIO bucket. Rotate any key that has been shared in chat or committed by mistake. If a native Redis is installed on the same Windows machine, stop it or firewall port 6379; it is unauthenticated.
