# Skyline: What Was Fixed, What Was Added, What Still Needs Work

Change log, oldest section first. For how the system works today read `STUDENT_ORGANIZATION_SYSTEM_A_TO_Z.md`; the section at the bottom of this file ("Current state") lists what was last verified. Round 1 below was written on 10 Oct 2026 and some of its details (for example the six `password123` role accounts and the 30-test count) were superseded by later rounds.

## 1. Your requests

| Request | Result |
| :--- | :--- |
| Dashboard turned white, containers removed, plain | Done. White surface, no card boxes, hairline dividers only. |
| Calendar showing behind the Sales Ranking card | Fixed. New range calendar (`components/RangeCalendar.tsx`) renders as a `fixed` popover at z-60, above charts/rankings, closes on outside click/Esc. |
| Same font as landing and login | Done. TT Firs Neue everywhere; buttons/inputs/selects now inherit it; heavy weights capped (the font has one weight, so bold was smearing). Missing `fadeIn` animation defined. |
| Ticket as PDF with QR, scannable only by the site/app | Done. `GET /tickets/{code}/pdf`. The QR holds `SKYLINE1.<code>.<HMAC signature>` (not a URL). Generic scanners see opaque text; only Skyline check-in verifies it. Forged QRs are rejected. |
| Convert website into an app | Done as an installable PWA: manifest, icons, service worker (shell cache). Add to home screen / install from the browser. See "Still to do" for store apps. |
| Remove dummy data, keep only RBAC login, rest realtime | Done. See sections 3 and 4. |

## 2. Fixed

**Security / RBAC (the serious ones)**
- Login was 100% in the browser (localStorage users, client-side JWT with a hard-coded secret). Now real accounts in PostgreSQL, PBKDF2 password hashes, server-issued JWT, rate-limited login. The role shown is always re-read from the server (`/auth/me`).
- A sidebar "Role" dropdown let anyone switch to Admin. Removed.
- Opening `#dashboard` logged you in as the demo Admin. Removed; route is guarded by a verified session.
- "Become a member" modal let anyone become Member by typing `FULL-2026` as a payment reference. Removed. Membership now = request + officer records the payment.
- Google sign-in trusted an unverified token decoded in the browser. Now verified server-side (`POST /auth/google`).
- Order endpoints: anyone could view or cancel any order, and send any `member_id` to get member pricing. Now owner/staff only, and pricing comes from the signed-in account.
- Accountant and Admin were not recognised by backend permission checks. One role table now (`api/deps.py`).
- Real Google client secret was in `.env.example`. Replaced with a placeholder. **Rotate that secret**, it has been exposed. `.env` was also missing from `.gitignore`; added.

**Dashboard**
- KPI cards and charts were hard-coded numbers scaled by a fake factor. Now from `GET /dashboard/summary` (club-wide for staff, personal for members/guests).
- KPI cards and date bar were repeated on every tab. Now only on the Dashboard.
- Search box, help button, copy-profile-link and bell did nothing. Removed dead ones; bell now shows real unread announcements.
- Realtime never worked: `publish_event` was never called, and the WebSocket was not used by panels. Now every successful write broadcasts a topic and open panels refetch. Redis pub/sub duplicate delivery and the 2s subscriber timeout fixed.
- Time-zone bug in analytics (naive datetimes read in server zone) fixed.
- Members tab crashed the whole app (hidden fake fallback with the wrong shape). Fixed; also fixed the door-lookup field mismatch.
- "My tickets" missed tickets bought by email. Fixed.
- Frontend had three duplicate copies of auth/dashboard/panels and two Vite entry points. Consolidated into `frontend/`; old copies are in `legacy/` (safe to delete). `lucide-react` was missing from `frontend/package.json`; added. `VITE_API_URL` handling made robust.
- Tests used to write into your live DB (that is where the 54 junk members came from). They now use `skyline_test`.

**ISSUES.md items**: all seven addressed, table appended to `ISSUES.md`.

## 3. Added
- Password login/register, OTP login, Google login, change password (`/auth/*`).
- Signed ticket QR + PDF + `qr.png`, 8-character manual code, offline attendee manifest, batch check-in, camera scanner (jsQR).
- `GET /dashboard/summary`, `GET /payments/pending`, `GET /stats`, receipt upload.
- Finance "Awaiting payment" list with one-click "Mark cash received" (activates memberships/orders/tickets, moves dashboard numbers instantly).
- Guests can request a membership (Membership tab).
- Live Sync indicator, real-time panels, stock push events.
- SMTP sender, announcement "email all members" toggle and status pill.
- Public Fundraisers and Updates pages now read real data.
- `backend/scripts/bootstrap.py` (`--reset` wipes everything except the 6 RBAC accounts).
- New tests: `tests/test_dashboard_auth_tickets.py`.

## 4. Data now in the database
(Superseded in Round 2: only the first Admin exists on a clean install.) The original six RBAC accounts (password `password123`, change it via `SEED_PASSWORD` or Settings): admin, treasurer, accountant, officer, member, guest `@skyline.edu`, plus the minimum the Member login needs (current semester, one membership type, one ₹500 dues payment for Maya). Everything else starts empty and fills as people use the app. The live DB was reset with `--reset`.

## 5. Still to do
1. **Online payments**: only cash (officer-recorded) and the webhook endpoint exist. No payment gateway (Razorpay/Stripe) is wired. Unpaid ticket holds expire after 15 minutes (existing design).
2. **Store apps**: the PWA installs from the browser. Play Store / App Store need a wrapper (Capacitor or TWA) and developer accounts.
3. **SMTP**: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` in `backend/.env`; until then emails are skipped (and the UI says so).
4. **Production hardening**: set `APP_ENV=production`, a new `JWT_SECRET`, `TICKET_SIGNING_SECRET`, HTTPS (camera scanning needs it off localhost), and change seed passwords. The OTP dev code is shown only when not production.
5. **Google sign-in** shows "origin not allowed" locally until `http://localhost:3000` is added to the OAuth client in Google Cloud.
6. **Service worker** caches only the app shell; offline check-in needs the page opened once online per event.
7. Landing page sections (`LandingPage.tsx`, `AboutPage.tsx`, `PhoneUI.tsx`) are still marketing copy/mockups, not live data.
8. Bundle is one 720 KB chunk; code-splitting would help mobile load time.
9. Alembic is not stamped on your DB (it was created from `schema.sql`); `bootstrap.py` applies the two new columns, and `database/schema.sql` includes them.

## 6. How to run
```
docker compose up -d
cd backend && python -m scripts.bootstrap && python -m uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev        # http://localhost:3000
cd backend && python -m pytest                   # uses the skyline_test DB
```


---

# Round 2 (10 Oct 2026): roles, reminders, limits, reports, payments, event QR

## Added / fixed
| Request | What now happens |
| :--- | :--- |
| Dummy data off the sign-in page and website | Role-login buttons, `password123` hints, testmail helpers, `@skyline.edu` placeholders and the fake figures/names on the landing page are gone. Landing announcements, fundraisers and update pages read real data. The live database now holds exactly one account: the first Admin. |
| Sign-up rules | Students use `@gmail.com` or `@student.edu.in` (sub-domains too). Staff use `@company.com` / `@company.in`. Anything else is refused. Domains are settings (`STUDENT_EMAIL_DOMAINS`, `ADMIN_EMAIL_DOMAINS`). Organisation addresses must verify the inbox with an emailed code, and only the very first one becomes Admin; everyone after that is a Guest until an Admin assigns a role. |
| Admin assigns Treasurer / Officer | Dashboard > Admin > People & roles. Only an Admin can grant roles (an Officer calling the API gets 403); the last Admin cannot be removed. |
| Admin sees all users and roles | `GET /admin/users`: contact details, student ID, positions, membership status, tickets, orders, total paid. |
| Announcements by Admin or Officer | Treasurers/accountants can no longer post. Every post also creates an in-app notification for each member. |
| Reminders by notification + email + calendar, members only, by semester | A daily job notifies paid members 30 and 7 days before their semester ends (skipped if they already renewed), emails them with an "Add to Google Calendar" link, and reminds ticket holders the day before an event. Members also get an `.ics` file with 30 and 7 day alerts. Admin can run it on demand ("Send reminders now"). |
| Real notifications, fully realtime | New bell with unread count; switch on "Desktop alerts" and new items pop up as real operating-system notifications while the tab is open (browser permission required). Everything updates over the WebSocket, no refresh. |
| Limits for non-members and members | Non-member seat/unit quotas existed. Added per-person caps for members and for guests on both tickets and merchandise, set by Admin/Officer when creating an event or product, and editable afterwards (ticket types: Events tab, officer tools). Enforced on the server (`PURCHASE_LIMIT_REACHED`). |
| Reports | New Reports tab (Admin, Officer, Treasurer): profit per event, amount raised vs expenses (fundraisers), money in/out/balance, membership and dues, merchandise sales and stock, volunteer expenses, seats filled and attendance, who still owes what. Date filter, CSV export, live. |
| Payment gateway | Razorpay checkout was already added in Events and Membership. I added it to shop orders and to "Pay now" on unpaid tickets, added a signed `/webhooks/razorpay` that settles a payment even if the tab is closed, and fixed a hole: a signature from a cheap order could be replayed against a different membership/ticket/order (now each verify is bound to the order it was created for, the amount comes from the database, and the hard-coded fallback of 500 is gone). |
| Unique QR per event that opens the website | `GET /events/{id}/qr.png` (and "Event QR (poster)" + "Copy event link" on each event for officers). Scanning it opens `#event/<id>` on a phone: details, seats left, sign in, book, pay, get the ticket. The ticket's own signed QR stays scan-only. |
| Email sending | SMTP delivery for OTP codes, announcements, renewal and event reminders is implemented. It needs your SMTP credentials in `backend/.env`; until then the UI says so. |

## Security fixes found on the way
- `/auth/testmail-otp` returned a sign-in code for any email to anyone (full account takeover, including the admin) and had an API key hard-coded in source. It is now disabled outside development/test and the key moved to `.env`. **Rotate that testmail key.**
- Expense status `submitted` never matched the UI (`pending`), so treasurers could not approve anything. Fixed. Shop order status `placed` had the same mismatch. Fixed.
- The old Admin panel posted the wrong field names to the API (role/start_date vs position/starts_on), so it could not work. Rewritten.

## Needs your action
1. Log in as `admin@company.com` / `ChangeMe@123` (or whatever `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set before `python -m scripts.bootstrap`), change the password in Settings, then have staff sign up and assign them roles.
2. Put SMTP and Razorpay keys (and `RAZORPAY_WEBHOOK_SECRET`, plus the webhook URL in the Razorpay dashboard) in `backend/.env`.
3. For event QR codes to open on phones, set `FRONTEND_URL` to your LAN IP or domain (not `localhost`).
4. Google sign-in works only for emails passing the same domain rules; add `http://localhost:3000` to the Google OAuth client.

## Still open
- Razorpay is test-mode only until you add live keys; refunds are not built.
- Members cannot yet change their own purchase limits (by design); limits for products can be set at creation or via `PATCH /products/{id}/limits` (no inline editor in the UI yet).
- Desktop alerts need the site open in a tab. Alerts while the browser is closed need web-push (VAPID keys), not built.
- Email-based reminders are queued; Google Calendar is linked per reminder rather than synced to a calendar account.

---

# Round 3: designer, MinIO, exports, event forms

- Profile popup no longer clipped (rendered above the page). Member Portal tab removed from Admin.
- Ticket types have a description; admin/officer can edit price and description afterwards (`PATCH /ticket-types/{id}`). Restart the backend after pulling: an old server does not have this route.
- Merchandise: upload a photo or use the design studio (item, colour, draggable text and logos on front and back, print positions chest / left chest / shoulder / back, white-background removal, transparent export). Pictures are stored in MinIO (`docker compose up -d minio`, bucket `skyline-media`) and served through `/api/v1/media/...`; local disk is the fallback.
- Events: optional registration link (Google Form etc.). Only staff and holders of a paid ticket can see it, as a button and a QR.
- Reports export as CSV, Excel and PDF (logo header, SKYLINE watermark).
- Google sign-in only works for existing accounts; removed from the sign-up form.
- Razorpay verify now reports the real role instead of always "Member"; order, signature check and ticket activation tested against the live test keys.

---

# Problem statement coverage (checked scene by scene)

| Scene | Where it lives |
| :--- | :--- |
| A new student joins | Sign-up with emailed code (mandatory), student ID, Membership tab (semester, type, Razorpay or cash), member prices on tickets and shop, renewal reminders (notification, email, Google Calendar, .ics), door check shows member status |
| Spring gala tickets | Events: member and non-member prices, seat and per-person limits, ticket PDF with signed QR, phone booking via event QR, offline-capable door scanner, attendance and profit per event (Reports) |
| Announcing a meeting | Announcements (Admin/Officer): one post reaches all members in-app, by email, with a dated record |
| Hoodies | Shop: design studio, sizes with stock, orders, Razorpay or cash, stock shown per size |
| Fundraiser | Fundraisers: tasks with assignee picker, status, due date, progress bar, On track / At risk / Behind badge, money raised vs goal, all live |
| Treasurer | Finance + Reports: dues, tickets, merchandise, donations in; reimbursed expenses out; balance; CSV, Excel, PDF |

Added in this pass: door check-in now says whether the person is a paid member (online and offline manifest); fundraiser tasks can be assigned and reassigned, and every fundraiser shows its health without opening it.

---

# Demo data, no fallbacks, indexes

- `python -m scripts.seed_demo` adds a demo club on top of what exists (18 members who cannot sign in, a semester and dues, 4 events with sold and attended tickets, 5 merchandise items with pictures and stock, 10 orders, announcements, 2 fundraisers with tasks and donations, 7 expenses). It never overwrites or deletes anything, records what it added in `scripts/.demo_ids.json`, and `python -m scripts.seed_demo --remove` takes exactly those rows back out. A database dump was saved to `backups/` first.
- Fallbacks removed: pictures go to MinIO only (503 with a clear message if it is down, no silent local-disk copy); `TICKET_SIGNING_SECRET` is mandatory and separate from `JWT_SECRET`; the Finance, Members and Fundraisers panels show an error instead of quietly rendering an empty list when a request fails.
- Kept on purpose: the second mailbox for sending email, and the in-process realtime relay used only if Redis is down.
- Speed: 12 new indexes for ticket, payment, order, announcement and event lookups; the shop list now uses one grouped query instead of one per product.
- Events are split into Upcoming and Past, past events cannot be bought, and per-event admin controls sit behind one "Manage event" toggle.


---

# Current state (11 Oct 2026)

## Verified
- **Backend tests**: 44 pass against the isolated test database (`python -m pytest -q`).
- **Type-check**: `npx tsc --noEmit` is clean.
- **Visibility sweep** (real Chrome, every tab the role can see): Admin (10 tabs), Member (6) and Guest (5), each at desktop 1440 px and phone 390 px width. For every tab it checked page errors, failed requests (4xx/5xx), broken images, empty screens and sideways page scrolling. Result: no issues in any of the 6 role and size combinations. The one visual fix it led to: the personal dashboard no longer says "Sales ranking" for members and guests (it says "Where my money went").
- **Checkout, end to end**: Buy now and cart checkout review step, order creation, a real Razorpay test order, wrong-amount and forged-signature refusals, a correct signature marking the order paid with stock reduced.

## Fixed since Round 3
| Area | Fix |
| :--- | :--- |
| Sign-up | An emailed code is mandatory for every sign-up (a random number used to get in); codes only go to addresses that can use them, with per-address and per-IP limits. |
| Membership | A cancelled payment leaves an unpaid membership that can be retried ("Pay now"); it never grants member status. The payment response now reports the real role instead of always "Member". |
| Payments UI | Failed, declined or closed checkouts show an error and never a success message. |
| Checkout | Buy now did nothing; orders by signed-in admins/officers crashed (server error); paying for an order crashed (it read a total the table does not have); no payment step after checkout. All fixed, with a review window. |
| Events | Delete event (Admin may force it when tickets exist), Upcoming / Past tabs, per-event controls behind one toggle, ticket descriptions, editable prices and limits, registration form link and QR after payment. |
| Merchandise | Design studio (drag text and logos, front/back, print positions, transparent export), picture upload, MinIO storage with automatic thumbnails, delete product (hide if ordered), whole-product shop cards, centred product and checkout windows. |
| Reports | CSV, Excel and PDF (logo header, watermark). |
| Inputs | Money and count fields accept numbers only; the server rejects non-numbers with a clear 422 instead of a 500. |
| Door | Check-in shows whether the person is a paid member, online and offline. |
| Fundraisers | Assignee picker and reassignment, health badge, all tasks and progress load up front and stay live. |
| Fallbacks | No silent local-disk copy for pictures, ticket-signing key required and separate, failing panels show errors instead of empty lists. |
| Speed | 12 new indexes, one grouped query for the shop list, thumbnails for cards. |

## Operating notes
- Docker Desktop must be running for PostgreSQL, Redis and MinIO (`docker compose up -d`). Data lives in named volumes and survives restarts.
- After pulling backend changes, restart uvicorn; an old process does not have new routes.
- Demo data: `python -m scripts.seed_demo` / `--remove`. A database dump from before it was added is in `backups/`.

## Still open
- Razorpay is test mode until live keys are set; refunds are not built.
- Alerts while the browser is closed need web-push (not built).
- Treasury is single-entry in/out, not double-entry.
- Email depends on the Gmail App Passwords in `.env`; keys shared in chat should be rotated.
- Store apps (Play Store / App Store) need a Capacitor or TWA wrapper.

## Production deployment (11 Oct 2026)
Added `DEPLOY.md`, `backend/Dockerfile`, `deploy/` (compose stack with Caddy HTTPS, Postgres, Redis, MinIO, backup script, `.env.production.example`), and `frontend/netlify.toml`. The API now creates its own schema on an empty database, refuses the default Admin password in production, takes extra allowed sites from `CORS_ORIGINS`, and only accepts live-update connections from allowed sites. `requirements.txt` was missing razorpay, minio and xlsxwriter and now lists them. The stack was built and exercised locally from scratch (see DEPLOY.md section 7).

## Localhost stall (11 Oct 2026)
Tests and local requests took about 2 s each because `localhost` resolved to IPv6 `::1` first while Postgres listens on IPv4 only (it was rebound to 127.0.0.1). Database and MinIO URLs now use `127.0.0.1`; the slow ticket test went from 36 s to 1.3 s and the full suite passes in about 24 s. See `PROJECT_REPORT.md` for the full report.
