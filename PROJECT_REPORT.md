# Skyline Student Association Platform: Full Project Report

From an empty folder to a production deployment: what was built, why, how it works, where the crucial code lives, what went wrong along the way, and how to run it.

> Written 11 Oct 2026 from the state of the repository at that date. File paths are relative to the repository root. Line numbers are accurate for this commit and will drift as the code changes; the function names will not.
> Companion documents: `README.md` (quick start), `DEPLOY.md` (production runbook), `STUDENT_ORGANIZATION_SYSTEM_A_TO_Z.md` (product and API guide), `WEBSITE_STATUS.md` (change log), `ISSUES.md` (issue history and security review).

---

## Contents

1. [The product in one page](#1-the-product-in-one-page)
2. [The requirements, scene by scene](#2-the-requirements-scene-by-scene)
3. [How the project was built (timeline)](#3-how-the-project-was-built-timeline)
4. [Architecture](#4-architecture)
5. [Repository map](#5-repository-map)
6. [Zero to running on your machine](#6-zero-to-running-on-your-machine)
7. [The database](#7-the-database)
8. [Backend deep dive](#8-backend-deep-dive)
9. [Frontend deep dive and design system](#9-frontend-deep-dive-and-design-system)
10. [Feature walkthroughs (end to end)](#10-feature-walkthroughs-end-to-end)
11. [Security](#11-security)
12. [Testing and quality](#12-testing-and-quality)
13. [Bugs and incidents: what broke and why](#13-bugs-and-incidents-what-broke-and-why)
14. [Demo data and operational scripts](#14-demo-data-and-operational-scripts)
15. [Going to production](#15-going-to-production)
16. [Operating production](#16-operating-production)
17. [Known limits and roadmap](#17-known-limits-and-roadmap)
18. [Appendices](#18-appendices)

---

## 1. The product in one page

**What:** one platform that runs a student club's three jobs: **events** (ticketing, door check-in), **members** (sign-up, dues, renewal, roles) and **money** (dues, tickets, merchandise, donations, expenses, reports).

**Who uses it:**

| Person | Does |
| :--- | :--- |
| Guest | Browses events and shop, books tickets and orders at non-member prices, buys a membership |
| Member | Same, at member prices; sees personal dashboard; gets renewal reminders |
| Officer | Creates events and ticket types, runs the door, designs and sells merchandise, posts announcements, manages fundraisers, records cash |
| Treasurer / Accountant | Approves expenses, records cash, reads finance and reports |
| Admin | Everything, plus assigns roles, sees all users, can force-delete events |

**What it replaced:** a membership spreadsheet, paper tickets and cash at the door, a notebook budget, WhatsApp announcements, receipts chased for weeks.

**Shape of the system:**

```
 Phone / laptop browser (React PWA)
        │  HTTPS (REST + WebSocket)
        ▼
 FastAPI service ──► PostgreSQL 16   (truth: members, money, tickets, stock)
        │       ├──► Redis 7         (rate limits, one-time codes, live-update bus, payment binding, email queue)
        │       ├──► MinIO           (product pictures and thumbnails)
        │       ├──► Razorpay        (payments, webhook back to us)
        │       └──► SMTP (Gmail)    (codes, reminders, announcements)
```

---

## 2. The requirements, scene by scene

The brief (a "Student Organization System") describes six situations. Each maps to a concrete feature set and a place in the code.

| Scene | What the club needs | Where it lives |
| :--- | :--- | :--- |
| A new student joins | Identity, dues, member benefits, renewal reminder, "is this person a member?" at the door | `AuthPage.tsx`, `MembershipPanel.tsx`, `member_service.py`, `jobs/membership_reminders.py`, door result in `event_service._membership_for_tickets` |
| Selling tickets for the gala | Member/non-member prices, seat limits, online sale, instant door check, attendance and profit afterwards | `EventsPanel.tsx`, `event_service.py`, `event_repo.check_in_ticket`, `CheckInPanel.tsx`, `report_center.event_profit` |
| Announcing the next meeting | One post reaches everyone, with a dated record | `AnnouncementsPanel.tsx`, `announcement_service.py`, `notification_service.py`, `email_worker.py` |
| Ordering hoodies | Sizes, orders, payment, stock per size | `ShopPanel.tsx`, `MerchDesigner.tsx`, `shop_service.py`, `shop_repo.place_order` |
| Planning a fundraiser | Split tasks, see who does what, is it on track | `FundraisersPanel.tsx`, `fundraiser_service.py`, view `fundraiser_progress` |
| The treasurer closes the books | What came in, what went out, what is left | `FinancePanel.tsx`, `ReportsPanel.tsx`, `report_center.py`, `report_export.py`, view `club_balance` |

Requirements added by the owner during the build (all delivered): real role-based sign-in, no dummy data on public pages, sign-up domain rules, admin-only role assignment, announcements by Admin/Officer only, renewal reminders by notification + e-mail + Google Calendar, per-person purchase limits for members and non-members, eight reports in CSV/Excel/PDF, Razorpay payments, real-time everything, per-event poster QR that opens the booking page, installable phone app, merchandise design studio, MinIO storage, registration-form link after payment, delete event/product, production deployment.

---

## 3. How the project was built (timeline)

The work happened in rounds. Each round started from a request, found root causes rather than patching symptoms, and ended with tests and a doc update.

| Round | Request | Outcome |
| :--- | :--- | :--- |
| 1 | Fix dashboard, calendar, fonts, RBAC login; remove dummy data; ticket PDF with scan-only QR; make it an app | White plain dashboard fed by `/dashboard/summary`; range calendar rendered above charts; server-side accounts and JWT; signed QR + PDF; PWA; WebSocket live refresh; tests moved to an isolated database |
| 2 | Fix gaps against the brief (renewal reminders, per-event report, CSV import) | Reminder job, event/fundraiser reports, member CSV import, cash "mark paid" |
| 3 | Sign-up domain rules, admin-only roles, announcements by Admin/Officer, reminders by semester, per-person limits, 8 reports, Razorpay, real notifications, event QR | `check_signup_domain`, `ASSIGNABLE_POSITIONS`, `RequireAnnouncer`, `per-person` limit enforcement, `report_center.py`, Razorpay order/verify/webhook, notifications table, `GET /events/{id}/qr.png` |
| 4 | Clean landing/sign-in, one admin account, working OTP e-mail with logo | Branded HTML mail with embedded logo, Gmail on port 465 with a backup mailbox |
| 5 | Edit prices later, descriptions, registration link, Excel/PDF reports, design studio, MinIO | `PATCH /ticket-types/{id}`, `events.form_url`, `report_export.py`, `MerchDesigner.tsx`, `storage.py` |
| 6 | Delete event/product, payment correctness, OTP bypass, numeric inputs, thumbnails | Delete endpoints with safeguards; "failed payment never shows success"; mandatory sign-up code; `numeric.ts`; thumbnails |
| 7 | Demo data, efficiency, no fallbacks | `seed_demo.py`, 12 indexes, grouped shop query, MinIO-only storage, required ticket key |
| 8 | Checkout end to end, product popup position | Two server bugs fixed, review step, modals rendered into `document.body` |
| 9 | Visibility test, docs, security review | Browser sweep (3 roles x 2 sizes), docs rewritten, hardening, Redis incident |
| 10 | GitHub and production | Docker image, Caddy stack, Vercel/Netlify config, `DEPLOY.md`, this report |

---

## 4. Architecture

### 4.1 Layers (backend)

```
HTTP request
   │
   ▼
Middleware: RequestID → security headers → RealtimeBroadcast → CORS     (app/main.py, app/core/middleware.py)
   │
   ▼
Router (app/api/v1/*.py)      thin: parse, authorize with Depends(...), call a service
   │
   ▼
Service (app/services/*.py)   business rules, transactions, commits, side effects
   │
   ▼
Repository (app/repositories/*.py)   SQL: queries, row locks
   │
   ▼
PostgreSQL (constraints, triggers, views are the last line of defence)
```

Rules that keep it maintainable: routers never contain business logic; services decide and commit; repositories only talk to the database; the database enforces what must never be violated (seat limits, non-member goodie limits, one active semester range).

### 4.2 Why these technologies

| Choice | Why |
| :--- | :--- |
| FastAPI + async SQLAlchemy + asyncpg | Many concurrent short requests (ticket rush) on one process; typed request/response models |
| PostgreSQL | Row locks (`SELECT ... FOR UPDATE`), triggers, exclusion constraints, views: the money and seat rules belong in a real database |
| Redis | One-time codes with TTL, rate limiting, pub/sub for live updates, a short-lived binding between a Razorpay order and what it pays for, an e-mail queue |
| MinIO | S3-compatible object storage for pictures; swap for S3 later without code changes |
| React + Vite + Tailwind | Fast build, component panels per feature, one design system |
| PWA | A club app on phones without an app store; offline door check-in needs a service worker and IndexedDB |
| Razorpay | Payments in INR with UPI/cards; signature scheme is simple to verify server-side |
| Caddy | Automatic HTTPS certificates with a three-line config |

### 4.3 Environments

| | Development | Production |
| :--- | :--- | :--- |
| API | `uvicorn app.main:app --port 8000` | Docker image behind Caddy on 443 |
| Site | `npm run dev` on 3000 | Static build on Vercel or Netlify |
| Postgres / Redis / MinIO | `docker-compose.yml` (Postgres 127.0.0.1:5432, Redis 127.0.0.1:6380, MinIO 127.0.0.1:9000/9001) | `deploy/docker-compose.prod.yml`, no ports published except Caddy's 80/443 |
| Config | `backend/.env` | `deploy/.env.production` |
| `APP_ENV` | `development` | `production` (docs off, sign-in codes never echoed, secure cookies, HSTS, weak-secret check) |

---

## 5. Repository map

```
backend/
  app/
    main.py                 app creation, middleware, router registration, background workers (lifespan)
    core/                   config, database, security, redis, realtime, errors, middleware, logging, helpers
    api/deps.py             authentication + role dependencies (RequireOfficer/Admin/Announcer/Treasurer)
    api/v1/                 routers: auth, members, events, shop, finance, online_payments, fundraisers,
                            announcements, dashboard, admin, notifications, reports, report_center, websocket, system
    services/               business logic (auth, event, shop, finance, member, fundraiser, announcement,
                            dashboard, notification, storage, ticket_pdf, report_export)
    repositories/           SQL access
    schemas/                Pydantic request/response models
    models/schema_models.py SQLAlchemy models (mirror of database/schema.sql)
    jobs/                   email_worker, hold_cleanup, membership_reminders
  scripts/                  bootstrap.py, seed_demo.py, send_test_email.py
  tests/                    pytest suite (44 tests)
  Dockerfile, requirements.txt, alembic/
database/schema.sql         tables, triggers, views, indexes
frontend/
  src/                      App.tsx, AuthPage.tsx, RoleDashboard.tsx, apiClient.ts, authService.ts,
                            useRealtimeUpdates.ts, offlineCheckin.ts, razorpayPayment.ts, numeric.ts
  src/panels/               one file per dashboard tab
  src/components/           landing pages, overview charts, designer, notification bell, event page
  public/                   manifest, service worker, icons, logo, videos
  vercel.json, netlify.toml
deploy/                     production compose, Caddyfile, env template, backup script
docker-compose.yml          local services
*.md                        README, DEPLOY, this report, A_TO_Z guide, WEBSITE_STATUS, ISSUES
```

---

## 6. Zero to running on your machine

**Prerequisites:** Docker Desktop (running), Python 3.13, Node 20+, Git.

```bash
git clone https://github.com/oggigachad/odoo.git && cd odoo

# 1. Services: PostgreSQL, Redis (password, port 6380), MinIO
docker compose up -d

# 2. Backend configuration
cd backend
cp ../.env.example .env          # edit; see the variable table in section 18.1
pip install -r requirements.txt
python -m scripts.bootstrap      # creates the schema on an empty database, indexes, the first Admin
python -m uvicorn app.main:app --port 8000

# 3. Frontend (second terminal)
cd frontend && npm install && npm run dev      # http://localhost:3000
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults `admin@company.com` / `ChangeMe@123`), change the password in Settings, then have staff sign up and assign roles in Dashboard > Admin.

Optional: `python -m scripts.seed_demo` adds a demo club; `python -m pytest -q` runs the tests (needs a `skyline_test` database, see section 12).

**Two gotchas learned the hard way:**
- Use `127.0.0.1`, not `localhost`, in database and storage URLs. On Windows `localhost` resolves to IPv6 `::1` first; the services listen on IPv4 only, so every new connection waited about two seconds before falling back (a ticket test went from 36 s to 1.3 s after the change).
- Docker Desktop must be running before the API starts. If port 6379 is already taken by a native Redis, the Docker Redis is published on 6380 on purpose (section 13).

---

## 7. The database

Source of truth: `database/schema.sql` (the SQLAlchemy models in `backend/app/models/schema_models.py` mirror it). `scripts/bootstrap.py` creates the whole schema on an empty database (`_ensure_schema`) and applies later additions idempotently (`DDL` list: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), so old databases upgrade in place and a failed deploy can roll back to older code.

### 7.1 Entity overview

```
members ──< leadership_roles               (the only source of staff roles)
members ──< memberships >── semesters      (active = paid AND today within the semester)
                 └──── membership_types    (editable tiers with dues)
payments ── settles ──> memberships | tickets | orders | (fundraiser donations)
events ──< ticket_types ──< tickets
products ──< product_variants ──< order_items >── orders
fundraisers ──< fundraiser_tasks >── members (assignee)
members ──< expenses (optional event / fundraiser)
announcements (posted_by members), notifications (per member)
```

### 7.2 Tables and the decisions inside them

| Table | Key columns | Notes |
| :--- | :--- | :--- |
| `members` | `email` (unique, lower-cased index), `password_hash`, `student_id`, `phone`, `joined_on` | One person, one row, whatever their role |
| `leadership_roles` | `member_id`, `position`, `term_year`, unique together | Admin, Officer, President, Treasurer, ...; the **only** place roles live |
| `semesters` | `starts_on`, `ends_on` | `EXCLUDE USING gist (daterange(...) WITH &&)` makes overlapping semesters impossible |
| `membership_types` | `name`, `dues_amount`, `is_offered` | Tiers are data, not code |
| `memberships` | member, semester, type, `dues_amount` snapshot, `payment_id` | Unique per member and semester. **No `payment_id` means not a member**: an unpaid attempt can never grant benefits |
| `payments` | `category` (`dues`/`ticket`/`merchandise`/`fundraiser`), `amount`, `method` (`cash`/`online`), `external_ref` (unique) | `external_ref` is the Razorpay payment id: it makes retries and webhooks idempotent |
| `events` | title, description, venue, `starts_at`, `form_url` | `form_url` is the optional registration link shown only after payment |
| `ticket_types` | name, `description`, member and non-member price, `seat_limit`, `non_member_seat_limit`, `max_per_member`, `max_per_guest` | Constraint: non-member seats cannot exceed total seats |
| `tickets` | holder, `price_paid`, `payment_id`, UUID `ticket_code`, `checked_in_at/by` | Valid when `payment_id` is set or the price was 0 |
| `products` | name, prices, `non_member_limit`, per-person caps, `image_url`, `is_active` | `is_active=false` hides a product that has orders |
| `product_variants` | `size`, `stock_quantity` | Unique per product and size |
| `orders` / `order_items` | status `placed`/`paid`/`cancelled`, unit price snapshot | There is **no stored total**: it is always the sum of the lines |
| `fundraisers` / `fundraiser_tasks` | goal, date; task assignee, status, due date | |
| `expenses` | amount, receipt, status `submitted/approved/reimbursed/rejected`, optional event/fundraiser | `CHECK ((status='reimbursed') = (reimbursed_at IS NOT NULL))` |
| `announcements`, `notifications` | | Notifications are de-duplicated by a unique index so a reminder is never sent twice |

### 7.3 Rules enforced by the database itself

- **Trigger `enforce_seat_limit`** (before insert on `tickets`): locks the ticket type row, counts sold tickets, raises if the event or the non-member allocation is full.
- **Trigger `enforce_non_member_goodie_limit`** (before insert on `order_items`): sums non-member units already ordered for the product and refuses to exceed `non_member_limit`.
- **Exclusion constraint** on semester date ranges.
- **Check constraints** on prices >= 0, positive seat limits, and the expense status/timestamp pair.
- **Views** used by reports and dashboards: `active_members`, `memberships_due_for_renewal`, `ticket_availability`, `event_summary`, `fundraiser_progress`, `treasurer_summary`, `club_balance`.
- **Indexes** on the hot paths (door lookup, my tickets by member/e-mail/payment, payments by date/member, orders by status, announcements and events by date, active products).

Why in the database and not only in code: two phones buying the last seat in the same millisecond must produce exactly one ticket. Application checks alone cannot guarantee that; a trigger under a row lock can.

---

## 8. Backend deep dive

### 8.1 Configuration (`backend/app/core/config.py`)

One `Settings` class (pydantic-settings) reads environment variables and `backend/.env`. Highlights: `APP_ENV`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `TICKET_SIGNING_SECRET`, `STUDENT_EMAIL_DOMAINS`/`ADMIN_EMAIL_DOMAINS` (with parsed `student_domains`/`admin_domains` properties), `SMTP_*`/`SMTP2_*`, `RAZORPAY_*`, `MINIO_*`, `FRONTEND_URL`, `CORS_ORIGINS`, `allowed_origins` (property combining the two, plus localhost origins outside production).

Startup guard (`main.py` lifespan): outside development/test the app refuses to start with a default or short `JWT_SECRET`. `security._ticket_key()` raises if `TICKET_SIGNING_SECRET` is unset, so ticket QR codes can never be signed with the login key.

### 8.2 Identity, sign-in and sign-up (`services/auth_service.py`, `api/v1/auth.py`)

**Who can sign up.** `check_signup_domain` (line ~138) accepts only the configured student domains (sub-domains match) and staff domains; anything else is a 422. The first verified staff-domain sign-up becomes Admin (`_bootstrap_first_admin`); everyone else starts as Guest until an Admin assigns a role.

**Sign-up requires an e-mailed code.** `register(...)` verifies the domain, rejects an existing e-mail (409), then consumes the one-time code with `verify_and_consume_otp` before creating the member. This closed an early bug where a password-only sign-up skipped verification entirely.

**One-time codes** (`generate_otp`, `core/redis.py`): 6 digits from the OS random source, stored in Redis for 5 minutes, at most 5 wrong attempts, deleted on first success. Codes are only sent to addresses that can use them: for sign-in the account must exist (unknown addresses get the same response but no code and no e-mail); for sign-up the domain must be allowed and the account must not exist. Limits: 1 per address per minute, 3 per address per 15 minutes, 5 per IP per 5 minutes. In `development`/`test` the code is echoed in the response only to a caller on the same machine.

**Password sign-in** (`login_with_password`): PBKDF2-HMAC-SHA256, 600,000 iterations (20,000 under test), salt per password, iteration count stored in the hash so older hashes still verify (`core/security.py` lines 71 to 90). Rate limited per IP.

**Google sign-in** (`login_with_google`): the ID token is verified server-side against Google and the configured client ID, the e-mail must be verified, and the account **must already exist**; Google can never create an account.

**Sessions:** HS256 JWT valid 24 hours, returned in the body and set as an httpOnly `session` cookie (`Secure` outside development). The API client sends the token as a bearer header, which is what makes a cross-site setup (site on Vercel, API on another domain) work without cross-site cookies.

### 8.3 Roles and permissions (`api/deps.py`)

Positions come from `leadership_roles`. `AuthService.resolve_access_level` collapses them into the five levels the UI uses: **Admin > Treasurer (Accountant) > Officer (President, Vice President, Secretary, Officer) > Member (paid, active) > Guest**.

Route protection is declarative:

```python
RequireOfficer   = require_role(list(OFFICER_POSITIONS))      # includes finance roles and Admin
RequireAdmin     = require_role(["Admin"])
RequireAnnouncer = require_role(list(ANNOUNCER_POSITIONS))    # Admin + officers, NOT finance
RequireTreasurer = require_role(list(FINANCE_POSITIONS))

@router.patch("/ticket-types/{id}")
async def update_ticket_type(..., _: Annotated[MemberInfo, Depends(RequireAnnouncer)], ...)
```

`ASSIGNABLE_POSITIONS` is the list Admin may hand out. The browser decides which tabs to draw (`getTabsForRole` in `RoleDashboard.tsx`); every endpoint re-checks, and the role shown is always re-read from `/auth/me`, never from storage.

### 8.4 Tickets and the signed QR (`core/security.py`, `services/ticket_pdf.py`)

The QR does **not** contain a URL. It contains `SKYLINE1.<ticket-uuid>.<signature>`, where `signature = HMAC-SHA256(TICKET_SIGNING_SECRET, ticket_uuid)[:20]`:

```python
def sign_ticket_code(ticket_code):  return hmac.new(_ticket_key(), ticket_code.lower().encode(), hashlib.sha256).hexdigest()[:20]
def build_ticket_qr_payload(code):   return f"SKYLINE1.{code.lower()}.{sign_ticket_code(code)}"
def parse_ticket_qr_payload(p):      # constant-time compare; returns the code or None
```

A generic phone scanner just sees opaque text; only the club's check-in can verify it, and a forged code fails the signature. Tickets are downloadable as PDF (`render_ticket_pdf`: A5 page, purple header, event details, QR with a quiet zone of 4 modules, 8-character manual code) and as `qr.png`.

**Buying** (`event_service.purchase_tickets`, line 207): per-person caps are checked first (`_enforce_person_limits`: members vs non-members, from `ticket_types.max_per_member/max_per_guest`), then rows are inserted; the seat trigger is the final guard. Paid tickets are **held for 15 minutes**: `jobs/hold_cleanup.release_unpaid_holds` sweeps every 60 seconds, deleting unpaid tickets and cancelling unpaid orders (restoring stock).

### 8.5 The door (`repositories/event_repo.check_in_ticket`, `event_service.check_in`)

`check_in_ticket` locks the ticket row `FOR UPDATE` so two scans of the same ticket cannot both succeed, and returns exact failure codes: `TICKET_NOT_FOUND`, `TICKET_WRONG_EVENT`, `TICKET_UNPAID`, `TICKET_ALREADY_CHECKED_IN`. A free ticket (price 0) is valid without a payment. The service accepts a signed QR payload, a full UUID, or the 8-character manual code (`_resolve_ticket_input`) and then asks `_membership_for_tickets` whether the holder has a paid membership covering today, so the door screen can say "Member (type, valid until)" or "Not a member".

**Offline** (`frontend/src/offlineCheckin.ts`, `CheckInPanel.tsx`): while online, the panel downloads `GET /events/{id}/manifest` (code, signed payload, holder, type, checked-in flag, member flag) into IndexedDB. Scans validate against it with no network, are queued, and sync through `POST /checkin/batch` (each scan validated independently; conflicts are listed).

### 8.6 Merchandise (`services/shop_service.py`, `repositories/shop_repo.py`)

`place_order` (repo line 105) is one atomic transaction: lock the affected variants (`FOR UPDATE OF product_variants`), verify they exist, for non-members lock the product and check the non-member quota, create the order, check stock per line, decrement stock, insert the lines. The service adds per-person caps (`_enforce_person_limits`) and a required name and e-mail for anyone not an active member. The API route decides pricing from the **signed-in account**, never from the request body, so member prices cannot be spoofed; staff may order on someone's behalf (`member_id` honoured only for staff, and then that person's name/e-mail are recorded).

`list_products` makes one grouped query for non-member units taken (`get_non_member_units_taken_all`) instead of one per product. Variants are returned in a stable order (`relationship(order_by=variant_id)`).

Pictures: `POST /products/image` (Admin/Officer) validates type and size, stores the original and a 480x480 WebP thumbnail in MinIO (`services/storage.make_thumbnail`; design exports hold front and back side by side so the card thumbnail crops the front), and returns `{url, thumb_url}`. `GET /media/products/{name}` streams from MinIO; a missing thumbnail is generated on first request (so pictures uploaded before thumbnails existed still work). `DELETE /products/{id}` deletes a product with no orders and hides one with orders (`is_active=false`) so history is preserved.

### 8.7 Payments (`services/finance_service.py`, `api/v1/online_payments.py`)

Online payment is a four-step contract between browser, our API and Razorpay:

```
1  POST /payments/razorpay/order      server recomputes the price from the database
                                     (membership dues, sum of ticket prices, sum of order lines),
                                     refuses a wrong amount or an order that is not 'placed',
                                     creates the Razorpay order and stores in Redis
                                     oddo:v1:rzp:<order_id> -> {member, category, membership/tickets/order}
2  Razorpay checkout (browser)       the member pays
3  POST /payments/razorpay/verify    HMAC-SHA256(order_id|payment_id, key_secret) must match;
                                     the Redis binding must match THIS member and THESE items
                                     (stops a cheap order's signature being replayed on a dear one);
                                     duplicate payment id -> "already_processed";
                                     amount comes from the database; payment row + links created;
                                     response carries the person's real role and a message per category
4  POST /webhooks/razorpay           signed webhook settles the same payment if the tab was closed
                                     (idempotent through payments.external_ref)
```

Cash (`record_cash_payment`, "Mark cash received"): an officer settles a pending membership, ticket or order and the same linking happens. The browser side (`frontend/src/razorpayPayment.ts`) reports **exactly one outcome per checkout**: success only after the server confirms; a declined card (`payment.failed`), a closed window or a failed verification calls the error callback and never shows success.

### 8.8 Real-time updates (`core/realtime.py`, `core/middleware.py`, `api/v1/websocket.py`)

`RealtimeBroadcastMiddleware` watches every successful write under `/api/v1` and publishes `data_changed` with a topic derived from the first path segment (`events`, `shop`, `finance`, `members`, `announcements`, `fundraisers`, `notifications`, plus `dashboard` for money-related writes). `publish_event` delivers to local WebSocket clients immediately and publishes on a Redis channel so other API processes relay it (`redis_pubsub_listener`, a dedicated connection without a read timeout). The WebSocket `/ws/updates` accepts only allowed origins. On the browser, `useLiveRefresh(['shop'], reload)` refetches when its topic fires, so panels update without reloads and the header badge shows "Live Sync".

### 8.9 E-mail (`jobs/email_worker.py`)

Jobs (`otp`, `magic_link`, `renewal_reminder`, `event_reminder`, `announcement_broadcast`) are pushed to a Redis list and consumed by `run_email_worker`. Delivery tries the primary Gmail account then the backup (`_send_smtp`): implicit TLS when the port is 465 (some networks block 587), STARTTLS otherwise, no TLS or login for a local test sink. Messages are multipart: plain text plus branded HTML (`_html`: purple header band, centred code box, button) with the logo embedded by content-id from `frontend/public/logo.png`. Failures retry with back-off, three attempts. Tests blank the SMTP settings in `conftest.py` so they can never send real mail.

### 8.10 Reminders and notifications (`jobs/membership_reminders.py`, `services/notification_service.py`)

A daily job notifies paid members 30 and 7 days before their **semester** ends (skipped when they have already renewed), queues an e-mail with an "Add to Google Calendar" link (`google_calendar_link`), and reminds ticket holders the day before an event. Notifications are rows in `notifications` with a unique de-duplication key; the bell in the header reads them and, if the member allows desktop alerts, shows real operating-system notifications while the tab is open. Members can also download an `.ics` file with 30 and 7 day alerts.

### 8.11 Reports and exports (`api/v1/report_center.py`, `services/report_export.py`)

Eight reports share one shape (`Report`: key, title, columns with kind text/money/int/percent/date, rows, totals). Registry: `event-profit`, `fundraisers`, `money`, `membership`, `merchandise`, `expenses`, `attendance`, `outstanding`. `GET /reports/{key}?start&end&format=json|csv|xlsx|pdf`. Excel uses XlsxWriter (branded header band with logo, number formats, totals); PDF uses ReportLab (logo band, diagonal "SKYLINE" watermark, zebra table, page numbers). Access: Admin, Officer, Treasurer.

### 8.12 Dashboard (`services/dashboard_service.py`)

`GET /dashboard/summary` returns cards, a time-bucketed series and a ranking. Staff get club-wide numbers; members and guests get their own (`scope: 'club' | 'personal'`, which the UI uses to relabel "Sales ranking" as "Where my money went"). Timestamps are handled as UTC-aware; an early bug showed ₹0 because naive datetimes were read in the server's local zone.

### 8.13 Errors, logging, health

`core/errors.py` defines typed `APIException`s (`ValidationError` 422, `NotFoundError` 404, `ServiceUnavailableError` 503, `PurchaseLimitError`, ...) rendered by `core/handlers.py` as `{error: {code, message, details, request_id}}`. `RequestIDMiddleware` stamps a request id on every response and log line. Unhandled errors are logged with the id and shown to the user as "Reference: <id>". The container health check calls `/api/v1/stats`.

---

## 9. Frontend deep dive and design system

### 9.1 Structure

| File | Role |
| :--- | :--- |
| `main.tsx` | Mounts the app, registers the service worker |
| `App.tsx` | Hash-based routing (`#auth`, `#dashboard`, `#event/<id>`), session restore through `/auth/me`, route guard, "return to this event after sign-in" |
| `AuthPage.tsx` | Sign-in (password, e-mail code, Google for existing accounts) and sign-up (e-mail code mandatory, domain rules shown from `/auth/signup-rules`) |
| `RoleDashboard.tsx` | Sidebar tabs per role, header with Live Sync, bell and profile; hosts the panels; settings modal |
| `apiClient.ts` | One `fetch` wrapper: base URL from `VITE_API_URL`, bearer token, `ApiError` with a readable message, 401 handler that signs out |
| `useRealtimeUpdates.ts` | `RealtimeProvider` (one WebSocket with ping and reconnect) and `useLiveRefresh(topics, cb)` |
| `offlineCheckin.ts` | IndexedDB manifest and scan queue |
| `razorpayPayment.ts` | Loads Razorpay, creates the order, opens checkout, verifies, reports one outcome |
| `numeric.ts` | `money()` and `digits()` input sanitisers |
| `panels/*.tsx` | One file per tab: Events, Shop, Membership, MemberPortal, Members, CheckIn, Fundraisers, Announcements, Finance, Reports, Admin |
| `components/` | Landing, About, Updates and Fundraiser public pages; `OverviewPanel` (charts), `RangeCalendar`, `NotificationBell`, `EventPage`, `EventFormAccess`, `MerchDesigner` |

### 9.2 Design system

- **Look:** white, plain surfaces; hairline dividers instead of boxed cards; one accent colour, Skyline purple `#714B67`, used for primary buttons, active tabs, badges and the sidebar; green and amber/rose only for status (valid, at risk, error).
- **Type:** the club font **TT Firs Neue** everywhere (landing, sign-in, dashboard); the font has a single weight, so heavy weights are capped to avoid smeared bold.
- **No emoji:** icons only, from `lucide-react`. Status is a small coloured pill with text.
- **Layout:** sidebar plus content on desktop; the sidebar becomes a drawer on phones. Content uses a responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`). Every page was checked at 1440 px and 390 px width for sideways scrolling.
- **Popups:** profile, product and checkout windows are rendered with `createPortal(..., document.body)` and lock page scroll. They were originally drawn inside a scrolling, animated container, so on long pages they opened at the top of the page and you had to scroll down to see them; portals anchor them to the viewport.
- **Charts:** hand-drawn SVG in `OverviewPanel` (sales/visits trend, ranking list, sparkline cards) so there is no chart library to load.
- **Calendar:** `RangeCalendar` is a `fixed` popover at a high z-index (an early bug had it appear behind the ranking card).
- **Inputs:** money fields accept digits and one decimal point (2 places); counts accept digits only; the server also rejects non-numbers with a 422.
- **Images:** shop cards show the whole product on a square tile using the generated thumbnail; the product window shows the full picture.
- **PWA:** `public/manifest.webmanifest`, icons, and `sw.js` caching the app shell; installable from the browser. The service worker is served with `Cache-Control: no-cache` so updates are picked up.

### 9.3 The merchandise design studio (`components/MerchDesigner.tsx`)

A small canvas editor, no external library. A garment is a polygon (`PATHS`: T-shirt, hoodie, tote) drawn on a 400x400 canvas with a shadow; layers are text or logos with `{view: front|back, x, y, size, color}`. Pointer events implement dragging (hit-test against each layer's box). Print-position buttons (`PLACEMENTS`: chest, left chest, shoulder, back upper, back centre) snap the selected layer and switch view. "Make white background transparent" (`removeWhite`) fades near-white pixels of an uploaded logo to alpha. Export draws the front at x=0 and the back at x=400 into an 800x400 canvas, optionally without background, uploads it with `?design=true` (so the server crops the front for the thumbnail), and the form stores the returned URL.

### 9.4 The event page and the poster QR

`GET /events/{id}/qr.png` renders a QR for `FRONTEND_URL/#event/<id>`. Scanning it on a phone opens `components/EventPage.tsx` (details, seats left per ticket type, descriptions, price for the visitor's role); not signed in, the visitor is sent to sign in and returned to the event afterwards. This is why `FRONTEND_URL` must be a LAN address or a public domain, not `localhost`.

---

## 10. Feature walkthroughs (end to end)

### 10.1 A member joins and pays

1. Sign-up: domain check, e-mailed code, account created as Guest (`AuthService.register`).
2. Membership tab: choose semester and type -> `POST /memberships` creates an **unpaid** membership (or reuses an earlier unpaid attempt) -> `processRazorpayPayment` -> verify -> `payment_id` is set -> `/auth/me` now reports `is_active`.
3. Cancel or failure: membership stays "Payment Pending" with a **Pay now** button; no status is granted.
4. Cash alternative: an officer clicks "Mark cash received" in Finance > Awaiting payment.
5. Later: reminder job (30/7 days before semester end) -> notification, e-mail, calendar link.

### 10.2 A gala ticket from poster to door

1. Officer creates the event with ticket types (descriptions, prices, seats, limits) and optional registration form link; prints the poster QR (`Event QR (poster)`).
2. Phone scans the QR -> EventPage -> sign in -> choose type -> `POST /tickets/purchase` (held 15 minutes) -> Razorpay -> `verify` -> ticket valid; the holder now sees the **Registration form** button and QR (`GET /events/{id}/form` is allowed only for staff and holders of a paid ticket).
3. Ticket PDF with signed QR is downloaded or shown in My Tickets.
4. At the door the officer opens Check-In, the manifest is cached, scans work online or offline, the result shows holder and member status.
5. Reports > Profit per event and Seats filled show sold, attended, no-shows, revenue, expenses, profit.

### 10.3 A hoodie order

1. Officer opens Shop > + Add Merchandise: name, prices, per-person caps, sizes with stock; uploads a photo or opens the design studio; saves (the picture is in MinIO with a thumbnail).
2. Member opens a product, picks a size, **Add to cart** (window closes, cart badge) or **Buy now**.
3. **Checkout** review window: lines with pictures, +/-, member price, total -> **Pay online** (order created, stock locked, Razorpay opens) or **Reserve** (held 15 minutes, pay from My Orders).
4. Paid -> order `paid`; all open screens update through the `shop` topic.

### 10.4 Fundraiser

Officer creates the fundraiser (goal, date) and tasks with an assignee picker; the assignee moves a task todo -> in progress -> done; each fundraiser shows tasks done, raised vs goal, and an **On track / At risk / Behind / Complete** badge computed in `FundraisersPanel.health` from task percentage, money percentage and days to the event.

### 10.5 Treasurer

Finance shows balance, awaiting-payment items and expenses to approve; Reports gives the eight reports with date filters and CSV/Excel/PDF export.

---

## 11. Security

### 11.1 Controls in place

| Area | Control |
| :--- | :--- |
| Passwords | PBKDF2-SHA256, 600,000 rounds, per-password salt, constant-time compare |
| Sessions | JWT HS256, 24 h, httpOnly cookie plus bearer header; strong `JWT_SECRET` required outside development |
| Sign-up/sign-in codes | Random, 5 min TTL, 5 attempts, single use, only sent to usable addresses, rate-limited per address and IP |
| Roles | Server-side on every route (`Depends(Require...)`); role re-read from `/auth/me`; Admin-only role assignment |
| Tickets | HMAC-signed QR with its own secret; constant-time verify; row-locked check-in |
| Payments | Server-side prices; HMAC verify; Redis order binding; idempotent `external_ref`; webhook signature |
| Input | Pydantic validation; parameterised SQL (`text()` with bound parameters); numeric fields rejected with 422; upload type and size limits |
| Transport/headers | HTTPS and HSTS (production), `nosniff`, frame deny, referrer policy, camera permission policy |
| Browser access | CORS limited to the configured site(s); WebSocket origin check |
| Surface | API docs off in production; databases and storage not published |
| Secrets | `.env` and `deploy/.env.production` git-ignored; ticket key separate from login key |

### 11.2 Findings from the security review (all recorded in `ISSUES.md`)

1. **Codes echoed in API responses** outside production would let anyone take over a known account: fixed (only to the same machine in development).
2. **Sign-up without a code** possible: fixed, code mandatory.
3. **A native Windows Redis 3.0 (2016, no password) on `0.0.0.0:6379`** was silently used by the API instead of the Docker Redis: fixed by moving the Docker Redis to `127.0.0.1:6380` with its password and pointing `REDIS_URL` there. The native Redis was left running because it may belong to something else; stop it or firewall the port.
4. Default or weak signing secrets: the app now refuses them.
5. Secrets pasted into chat (Gmail App Passwords, Google client secret, Razorpay keys, the default Admin password, a GitHub token): **rotate all of them**.
6. Open items: receipts under `/uploads/receipts` are public-by-URL (move to MinIO with signed links); no MFA or role-change audit log; a content-security policy once a domain exists.

---

## 12. Testing and quality

### 12.1 Automated

- **44 pytest tests** (`backend/tests/`) against an isolated database `skyline_test` and Redis db 1 (never the live data; this replaced an early setup where tests wrote into the live database).
- Create the test database once: `docker exec skyline_postgres createdb -U skyline_admin skyline_test`, load `database/schema.sql`, run `python -m scripts.bootstrap` with that `DATABASE_URL`.
- Coverage by file: auth and sign-up rules, roles and access levels, ticket QR/PDF/check-in, seat and per-person limits, concurrency (`test_concurrency_races`: no oversell), hold expiry, reminders, e-mail (against a local sink), events/tickets, shop orders and checkout, finance and treasurer, fundraisers, announcements, reports, members, semesters, Redis layer, helpers, system.
- `conftest.py` blanks SMTP, MinIO and (via env) the real mail and storage so tests never touch external services, and flushes the test Redis at session start.
- Frontend: `npx tsc --noEmit` must be clean; `npm run build` must succeed.

### 12.2 Manual and browser verification

- **Visibility sweep** (Playwright with real Chrome): every tab for Admin (10), Member (6) and Guest (5), at 1440 px and 390 px, checking page errors, 4xx/5xx responses, broken images, empty screens and sideways scrolling. Result: clean.
- **Checkout e2e**: Buy now, cart, review, a real Razorpay test order, a wrong amount refused, a forged signature refused, a valid signature marking the order paid with stock reduced.
- **Production rehearsal**: the production stack was built from scratch and exercised (section 15.4).

---

## 13. Bugs and incidents: what broke and why

A selection, with the root cause, because these are the lessons worth keeping.

| Symptom | Root cause | Fix |
| :--- | :--- | :--- |
| Price edits "did nothing" | The running API process was started before the route existed; an old process does not pick up new routes | Restart after pulling; documented |
| Sign-up accepted a random number | The e-mailed code was optional in the form and the password-only endpoint skipped verification | Code mandatory in schema, service and UI |
| Admin "Buy now" produced nothing | `setCart` then read `cart` in the same tick: stale state, empty order | Explicit checkout lines passed to the order function |
| Officer/admin orders returned 500 | Non-member orders store `member_id = NULL` and need a name and e-mail; the route kept the member id but never set the name | Route fills name/e-mail from the account; service validates |
| Paying for an order returned 500 | Code read `Order.total_amount`, which does not exist (the total is the sum of lines) | `_order_total` query; also refuse paying non-`placed` orders |
| Profile and product windows opened off-screen | `position: fixed` inside an animated, scrolling container is positioned against that container | Portals to `document.body` |
| A cancelled payment then "buy again" failed | Unique (member, semester) rejected the second attempt | Reuse the unpaid membership; "Pay now" button |
| Every payment response said role "Member" | Hard-coded response | Real role and per-category message |
| Dashboard sales showed 0 | Naive datetimes interpreted in server local time | UTC-aware datetimes |
| Members tab crashed | A hidden fake fallback returned the wrong shape | Real response mapped; fallback removed |
| Every request took ~2 s in tests | `localhost` resolved to IPv6 first while services listen on IPv4 | Use `127.0.0.1` |
| API used an old, unauthenticated Redis | Native Windows Redis already owned port 6379 | Docker Redis on 6380 with password |
| Whole site "500" after reboot | Docker Desktop was not running, so Postgres/Redis/MinIO were down | Start Docker, `docker compose up -d`; data survives in volumes |
| Fresh deploy would crash | `requirements.txt` lacked razorpay, minio, xlsxwriter | Added; production rehearsal caught it class of error |
| Gmail "login failed" | App Password required; port 587 blocked on the network | Implicit TLS on 465 and a backup mailbox |
| Postgres `AmbiguousParameterError` | asyncpg cannot infer a parameter type in some limit queries | Explicit `CAST` |

---

## 14. Demo data and operational scripts

| Script | Purpose |
| :--- | :--- |
| `python -m scripts.bootstrap` | Creates the schema on an empty database, applies indexes/columns idempotently, makes sure the first Admin exists. `--reset` wipes data (dev only). Refuses the default Admin password in production |
| `python -m scripts.seed_demo` | Adds a believable club on top of what exists: 18 members who cannot sign in, a semester and dues, 4 events with sold/attended tickets, 5 merchandise items with generated pictures (stored in MinIO with thumbnails), 10 orders, announcements, 2 fundraisers with tasks and donations, 7 expenses. Records every id in `scripts/.demo_ids.json` |
| `python -m scripts.seed_demo --remove` | Deletes exactly the rows it added |
| `python -m scripts.send_test_email <address>` | Sends the branded code e-mail to check SMTP |
| `deploy/backup.sh` | Nightly PostgreSQL and MinIO backup with 14-day retention |

---

## 15. Going to production

### 15.1 Topology

```
Vercel / Netlify  ── static React build ── https://site.example.com
Browser ──HTTPS──► Caddy :443 ──► api :8000 ──► postgres / redis / minio     (one Linux server, Docker Compose)
Razorpay ──webhook──► https://api.example.com/api/v1/webhooks/razorpay
```

Vercel and Netlify cannot run this API (long-lived WebSocket, background workers, PostgreSQL, Redis, object storage), which is why the site is static there and the API runs on a server.

### 15.2 What was added for production

- `backend/Dockerfile`: Python 3.13 slim, non-root user, copies code, scripts, schema and the logo to the paths the code expects, health check, one worker on purpose (the e-mail, reminder and hold-cleanup loops run in the app process), proxy headers on, start command runs `bootstrap` then `uvicorn`.
- `deploy/docker-compose.prod.yml`: Caddy, API, Postgres, Redis (password), MinIO; only Caddy publishes ports; named volumes; health-gated start order.
- `deploy/Caddyfile`: automatic certificates for `API_DOMAIN`, gzip, HSTS, 10 MB request limit, reverse proxy including WebSockets.
- `deploy/.env.production.example`: every required variable with comments; `deploy/backup.sh`.
- `frontend/vercel.json`, `frontend/netlify.toml`: build, single-page-app rewrite, security headers, long cache for hashed assets, `no-cache` for the service worker.
- App changes: `CORS_ORIGINS` setting, WebSocket origin check, schema auto-creation on an empty database, production refusal of default Admin password, requirements completed, vendor chunk splitting.

### 15.3 Step by step

The complete runbook is `DEPLOY.md`. In short: (1) server with Docker and a DNS A record for `API_DOMAIN`; (2) clone the repository, fill `deploy/.env.production`, `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`; (3) import the repository on Vercel/Netlify with root `frontend` and `VITE_API_URL=https://<API_DOMAIN>`; (4) set `FRONTEND_URL` (and `CORS_ORIGINS`) on the server to the site address and restart; (5) live Razorpay keys and webhook, Gmail App Password, optional Google client; (6) go-live checklist.

### 15.4 What was verified, and what could not be

Verified locally by running the production stack from nothing (with `API_DOMAIN=localhost`): schema and Admin created automatically, Caddy served HTTPS with HSTS, `/docs` returned 404, sign-in worked and codes were not echoed, picture upload and thumbnail through MinIO, CSV/Excel/PDF reports with the logo, ticket PDF and event QR, CORS allowed the configured site and refused another, the frontend built for production. The stack idled at about 260 MB of memory.

Not verifiable without your accounts: your DNS and certificate, live Razorpay keys and webhook delivery, Gmail delivery from the server, Vercel/Netlify deployment itself. A real server and domain were not available during this build, so the production system has **not** been started on the internet; everything needed to do so is in the repository.

---

## 16. Operating production

| Task | How |
| :--- | :--- |
| Deploy an update | `git pull && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build` (the database changes only by idempotent additions, so the previous release still runs) |
| Roll back | `git checkout <previous-commit>` and the same `up -d --build` |
| Logs and status | `... logs -f api`, `... ps` |
| Backup | `deploy/backup.sh` nightly by cron; copy the output off the server |
| Restore | `gunzip -c db_<stamp>.sql.gz | docker compose ... exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB`; restore the MinIO archive into the bucket volume |
| Rotate a secret | Edit `.env.production`, `up -d`; rotating `TICKET_SIGNING_SECRET` invalidates every issued ticket QR, so do it only between events |
| Never run | `docker compose down -v` (deletes the data volumes) |

Monitoring suggestions: an uptime check on `/api/v1/stats`; Sentry is already a dependency (`sentry-sdk`, configure a DSN); watch disk space for the volumes.

---

## 17. Known limits and roadmap

- Razorpay is test mode until live keys are set; refunds are not built.
- Alerts while the browser is closed need web push (VAPID keys).
- The treasury is a single-entry in/out view over `payments` and `expenses`, not double-entry accounting.
- One API process by design; to scale out first move the background loops to a separate worker.
- Receipts are served from local disk by URL; move to MinIO with signed links.
- No MFA for Admin, no audit log for role changes, no content-security policy yet.
- `signin.mp4` is 72 MB: compress it before deploying the site.
- Store apps need a Capacitor or Trusted Web Activity wrapper around the PWA.
- Frontend code-splitting by route would cut first-load size further (vendor chunks are already split).

---

## 18. Appendices

### 18.1 Configuration variables

| Variable | Used by | Meaning |
| :--- | :--- | :--- |
| `APP_ENV` | API | `development`, `test`, `production` |
| `DATABASE_URL`, `SYNC_DATABASE_URL` | API, bootstrap | PostgreSQL (use `127.0.0.1` locally) |
| `REDIS_URL` | API | `redis://:<password>@127.0.0.1:6380/0` locally |
| `JWT_SECRET`, `TICKET_SIGNING_SECRET` | API | Two different random secrets, 32+ characters |
| `STUDENT_EMAIL_DOMAINS`, `ADMIN_EMAIL_DOMAINS` | API | Who may sign up |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | bootstrap | First Admin |
| `SMTP_HOST/PORT/USER/PASSWORD`, `SMTP2_USER/PASSWORD`, `EMAIL_FROM` | e-mail worker | Primary and backup mailbox |
| `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`, `CURRENCY` | payments | Gateway |
| `MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET` | storage | Pictures |
| `FRONTEND_URL`, `CORS_ORIGINS` | API | The site address(es) allowed to call the API and linked from QR codes and e-mails |
| `GOOGLE_CLIENT_ID` | API | Google sign-in for existing accounts |
| `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID` | frontend build | API address; Google client |
| `API_DOMAIN`, `POSTGRES_*`, `REDIS_PASSWORD`, `MINIO_ROOT_*` | production compose | Server-side only |

### 18.2 API groups

`/auth` (login, register, otp/generate, otp/verify, google, me, password, signup-rules), `/members` and `/memberships`, `/events` and `/tickets` (create, ticket types, purchase, check-in, batch, manifest, pdf, qr, form), `/products` and `/orders` (+ `/media`), `/payments` (cash, pending, razorpay order/verify) and `/webhooks/razorpay`, `/fundraisers`, `/announcements`, `/expenses`, `/treasurer`, `/dashboard/summary`, `/reports`, `/admin`, `/notifications`, `/stats`, WebSocket `/ws/updates`. The full list with one-line descriptions is generated from the running server in section 8 of `STUDENT_ORGANIZATION_SYSTEM_A_TO_Z.md`; interactive docs at `/docs` in development.

### 18.3 Command cheat sheet

```bash
docker compose up -d                                   # local services
python -m scripts.bootstrap                            # schema + first Admin
python -m uvicorn app.main:app --port 8000             # API (backend/)
npm run dev                                            # site (frontend/)
python -m pytest -q                                    # tests (backend/)
npx tsc --noEmit                                       # type-check (frontend/)
python -m scripts.seed_demo [--remove]                 # demo club
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build   # production (deploy/)
```

### 18.4 Glossary

**Access level**: the single role the UI works with (Admin, Treasurer, Officer, Member, Guest). **Hold**: a 15-minute reservation of seats or stock while payment completes. **Manifest**: the attendee list cached on the door device. **Non-member seats / units**: the part of capacity or stock open to people without a paid membership. **Binding**: the Redis record linking a Razorpay order to the member and items it pays for. **Soft-hidden product**: a product with orders that is deactivated instead of deleted.
