# Skyline Student Association Platform

One installable web app for a student club's three jobs: **events, members and money**.

Today a club runs on a spreadsheet, cash at the door, a notebook and WhatsApp, so people miss events, money goes missing and nobody knows who owes what. With Skyline, students sign up with a verified college e-mail and pay semester dues by UPI. Officers sell gala tickets online with member prices and seat limits, and check people in at the door in a second, even offline. Hoodies are ordered from a phone with real stock per size. The treasurer sees money in, money out and the balance, and exports eight reports. Seats, stock and money are protected inside PostgreSQL, so two phones can never buy the same last seat.

**Live site:** [oddoskyline.netlify.app](https://oddoskyline.netlify.app)
**Jury guide:** [`Skyline_Jury_Guide.pdf`](Skyline_Jury_Guide.pdf) (test results, screens, design diagrams, 113 questions and answers)

| | |
| :--- | :--- |
| Backend | FastAPI (Python 3.13), SQLAlchemy 2 + asyncpg, PostgreSQL 16, Redis 7, MinIO, Razorpay |
| Frontend | React 19 + TypeScript, Vite, Tailwind v4, installable PWA |
| Edge | Caddy (automatic HTTPS) or Cloudflare tunnel; site on Netlify |
| Roles | Admin, Treasurer/Accountant, Officer, Member, Guest (decided by the server on every request) |

## Test results

Run on 11 October 2026 against a full local copy built from commit `d76b2b1`.

| Result | What it covers |
| :--- | :--- |
| **44 / 44** backend tests pass | pytest against a separate `skyline_test` database (41/44 on a clean checkout; see F11 below) |
| **80 / 83** end-to-end API checks pass | every role: sign-up rules, sign-in, role checks, events, pricing, seat caps, parallel buying, cash, ticket PDF and QR, door check-in, shop, Razorpay signatures, fundraisers, expenses, reports, validation, CORS, error format (plus 17 observations) |
| **70 / 70** role tabs clean | every sidebar tab for all five roles at 1440 px and 390 px: no console errors, no failed API calls, no sideways scrolling |
| **32 / 32** report exports | 8 reports, each as JSON, CSV, Excel and PDF |

## What it does

| Scene from the brief | Feature |
| :--- | :--- |
| A new student joins | Sign-up with an e-mailed code, Membership tab (semester and type), renewal reminders, member badge at the door |
| Spring Gala tickets | Member and non-member prices, seat and non-member caps, signed QR, Check-In tab, event-profit report |
| Announcing a meeting | Post once: in-app notification and e-mail to every member, dated history |
| Hoodies | Sizes with stock, cart, 15-minute hold, Razorpay, merchandise design studio |
| Fundraiser | Tasks with assignee and status, progress against goal, On track / At risk badge |
| Treasurer | Money in by category, reimbursed expenses, balance, cash payments; 8 reports in CSV, Excel and PDF |

Beyond the brief: real role-based sign-in, Razorpay online payment, semester-wise memberships with types, non-member seat and goodie limits, per-person purchase caps, real-time updates over WebSocket, offline door check-in, Google Calendar reminders, a merchandise design studio and MinIO picture storage.

### Roles

Each level includes everything below it.

| Role | Adds |
| :--- | :--- |
| Admin | Everything, plus assigning roles and force-delete |
| Treasurer / Accountant | Finance, cash, expenses, reports |
| Officer (President, VP, Secretary, Officer) | Events, door check-in, shop, fundraisers, announcements |
| Member (paid for the current semester) | Member prices, member portal |
| Guest (signed in, no membership) | Buy at non-member prices, buy a membership |

Staff positions are rows in `leadership_roles`; there is no role column on `members`. The session token carries no role: it is re-read from the database on every request, so removing an officer takes effect on their next click.

## How it is built

```
Browser (React 19 PWA) ──HTTPS + WebSocket──▶ Caddy / Cloudflare tunnel ──▶ FastAPI (one process)
                                                                            │
                     ┌──────────────────────┬───────────────────────────────┼───────────────────────┐
                PostgreSQL 16           Redis 7                          MinIO                Razorpay, Gmail SMTP,
             18 tables, 7 views,    codes, rate limits,         product pictures,         Google Identity,
             2 triggers, row locks  pub/sub, e-mail queue,      480×480 WebP thumbnails   Google Calendar links
             (source of truth)      Razorpay binding
```

A request moves through **Router** (parse with Pydantic, authorize with `Depends(RequireOfficer)` and friends) → **Service** (business rules, prices, limits, commit) → **Repository** (SQL only) → **PostgreSQL** (constraints, triggers and views as the last line of defence).

**The key design decision:** PostgreSQL is the source of truth for anything that must not be wrong (seats, stock, money, roles), and the rules that protect it live in the database itself. Redis, the browser and caches can all be wrong or empty and nothing is lost.

- **No overselling.** Buying a ticket locks the ticket-type row (`SELECT ... FOR UPDATE`), and the `enforce_seat_limit` trigger repeats the check. In testing, 6 parallel buyers for the last seats produced no oversell; the team's own test fires 20.
- **Server-side prices.** Purchase and order requests carry no price. Razorpay orders are created for the amount computed from the database.
- **Payments recorded once.** Razorpay signatures are verified with HMAC-SHA256 in constant time; a Redis binding ties each Razorpay order to the member and items it pays for; `payments.external_ref` is unique, so a repeated verify or webhook is recorded once.
- **Signed tickets.** The QR holds `SKYLINE1.<uuid>.<HMAC>`, not a URL, signed with its own `TICKET_SIGNING_SECRET`. The door locks the ticket row, so the same ticket cannot get in twice. Offline, the door device verifies against a downloaded manifest and replays scans through `/checkin/batch`, where each is checked again.
- **Holds.** Unpaid seats and stock are held for 15 minutes; a cleanup job runs every 60 seconds and never touches a paid ticket.
- **Money.** `NUMERIC(10,2)` in PostgreSQL, `Decimal` in Python, strings in JSON; never floats. Prices are snapshotted on memberships, tickets and order lines. The balance is computed, never stored.
- **Real time.** Successful writes publish a topic name (never data) over WebSocket and Redis pub/sub; screens re-read through the normal permission-checked API.

### Numbers to remember

| Item | Value |
| :--- | :--- |
| Tables / views / triggers | 18 / 7 / 2 |
| API routes | 100 under `/api/v1` in 16 routers, plus WebSocket `/ws/updates` |
| Automated tests | 44 pytest (17 files), real PostgreSQL and Redis |
| Reports | 8, each as JSON, CSV, Excel, PDF |
| Session | JWT HS256, 24 hours, role re-read from the database on every request |
| Passwords | PBKDF2-SHA256, 600,000 iterations, per-password salt |
| Sign-in codes | 6 digits, 5 minutes, 5 tries, 1 per minute per address |
| Seat or stock hold | 15 minutes; cleanup every 60 seconds |
| Ticket QR | `SKYLINE1.<uuid>.<20-hex HMAC>`, own secret |
| Razorpay binding | Redis, 1 hour, member + items + amount |
| Report cache | 30-60 s in Redis, cleared on payment or check-in |
| Main JS bundle | 676 kB (196 kB gzipped) |
| Brand | Plum `#714B67`, TT Firs Neue, lucide icons |

## Known issues

Found in the jury-preparation testing on 11 October 2026. Full evidence and patches are in Part 1 of the [jury guide](Skyline_Jury_Guide.pdf).

| ID | Severity | Issue | Fix |
| :--- | :--- | :--- | :--- |
| F1 | Critical | Legacy `POST /api/v1/webhooks/payment` has no signature check and no sign-in | Delete `api/v1/webhooks.py` and its `include_router` line; the signed `/webhooks/razorpay` already does this job |
| F2 | High | Ticket member price is chosen from the typed holder e-mail | Member price only for the signed-in account's own e-mail |
| F3 | High | Anonymous, unrate-limited ticket holds | Require sign-in, add a rate limit, cap open holds per account |
| F4 | Medium | Public `POST /members` skips the sign-up rules | Protect with `Depends(RequireOfficer)` |
| F5 | Medium | `/auth/check-email` reveals who has an account | Remove, or answer only during sign-up with a rate limit |
| F6 | Medium | A payment arriving after its hold expired is dropped silently | Record it, re-check under the lock, re-issue or refund and notify |
| F7 | Medium | Any officer can approve and reimburse expenses | Use `RequireTreasurer` if only the treasurer should decide |
| F8 | Medium | Rate limits trust a spoofable `X-Forwarded-For` | Set `--forwarded-allow-ips` to the proxy's address only |
| F9 | Low | Session token also kept in `localStorage` | Content-Security-Policy, or keep the token in memory |
| F10 | Low | Renewal reminder loop is defined and started twice in `main.py` | Delete the duplicate |
| F11 | Low | 3 tests depend on the developer's machine | Add `aiosmtpd` to `requirements-dev.txt`, create accounts in a fixture, default test keys |
| F12 | Low | Landing mock-up shows fixed sample numbers | Label it as an illustration or feed it from `/stats` |
| F13 | Low | Third-party fonts and images on the landing page | Self-host under `public/` |
| F14 | Low | Icon-only mobile menu button; inconsistent money formatting | `aria-label="Open menu"`, one money formatter |
| F15 | Info | Live API depends on one PC and a Cloudflare quick tunnel | Keep the PC awake for the demo; follow `DEPLOY.md` for production |

Other known limits: one API process by design, receipts public by URL (moving to MinIO signed links), no Admin MFA or role-change audit log yet, refunds done in the Razorpay dashboard, and a single-entry treasury view rather than double-entry accounting.

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

`python -m scripts.role_accounts` creates one account per role (Admin, Treasurer, Officer, Member, Guest) and prints the passwords once.

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

Create the test database once: `docker exec skyline_postgres createdb -U skyline_admin skyline_test`, then load `database/schema.sql` and run `python -m scripts.bootstrap` against it (set `DATABASE_URL` for that run). On a clean checkout three tests need extra setup (finding F11): install `aiosmtpd`, create `admin@skyline.edu` and `treasurer@skyline.edu`, and provide Razorpay test keys.

## Project layout

```
backend/app/api/v1/      routes (auth, events, shop, finance, reports, fundraisers, ...)
backend/app/services/    business logic (payments, tickets, storage, report export)
backend/app/jobs/        email worker, membership and event reminders, hold cleanup
backend/scripts/         bootstrap.py, role_accounts.py, seed_demo.py, send_test_email.py
backend/tests/           pytest suite
database/schema.sql      tables, triggers, views, indexes
frontend/src/            app, panels per feature, components, offline check-in
deploy/                  production Docker stack with Caddy, backups
docker-compose.yml       PostgreSQL, Redis, MinIO
```

## Deploying

Today the site is on Netlify and the API runs on a club PC in Docker Compose, published through a Cloudflare quick tunnel. The tunnel address changes whenever `cloudflared` restarts, and the site must then be rebuilt with the new `VITE_API_URL`.

`DEPLOY.md` is the step-by-step production guide: the site on Netlify (`netlify.toml`, `frontend/netlify.toml`), the API with PostgreSQL, Redis and MinIO on one Linux server (`deploy/docker-compose.prod.yml`) with automatic HTTPS from Caddy, only ports 80 and 443 published, and nightly backups (`deploy/`).

## More documentation

- [`Skyline_Jury_Guide.pdf`](Skyline_Jury_Guide.pdf): the pitch and 3-minute demo script, test findings with fixes, screens on desktop and phone, ten design diagrams, 113 jury questions with answers, the fix-before-demo checklist and every API route.
- `PROJECT_REPORT.md`: the full report from zero to production: design, architecture, crucial code explained, bugs and lessons, deployment and operations.
- `STUDENT_ORGANIZATION_SYSTEM_A_TO_Z.md`: architecture, roles, schema, modules, generated API reference and production notes.
- `WEBSITE_STATUS.md`: the change log and the "Current state" of what was verified.
- `ISSUES.md`: the issue history and the security review.

## Before going live

Fix F1 to F4 above. Set strong secrets, change every default password (Admin, MinIO, PostgreSQL, Redis), set `APP_ENV=production`, serve over HTTPS (the phone camera scanner needs it), use live Razorpay keys, and back up PostgreSQL and the MinIO bucket. Rotate any key that has been shared in chat or committed by mistake. If a native Redis is installed on the same Windows machine, stop it or firewall port 6379; it is unauthenticated.
