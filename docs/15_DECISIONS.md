# 15 — Decisions

A log of choices that shape the system. Add an entry **before** building anything not covered by the brief (`00_MASTER_RULES.md` §2).

**Status values:** `Accepted` (agreed, build on it) · `Proposed` (my recommendation, needs your yes) · `Open` (needs input, no recommendation yet) · `Superseded by D-xxx`.
D-001, D-002, D-027 and D-028 are accepted so far (D-027 is the stack you chose, D-028 is the Redis decision you set); everything else is proposed for review. Flip the status in the same PR that acts on it.

## Index
| ID | Decision | Status |
|---|---|---|
| D-001 | The brief (PDF) is the scope boundary | Accepted |
| D-002 | PostgreSQL is the only system of record, seat holds included (Redis added as a speed layer by D-027, D-028) | Accepted |
| D-003 | Schema design as delivered in `schema.sql` | Proposed |
| D-004 | Backend FastAPI + SQLAlchemy 2 + Alembic (web part superseded by D-027) | Proposed |
| D-005 | Web first, Expo mobile app in Phase 2 | Proposed |
| D-006 | Passwordless magic-link auth (single-use links added by D-028, role login pages by D-029) | Proposed |
| D-007 | Roles derived from `leadership_roles` for the current year | Proposed |
| D-008 | Reservations (seat holds) as unpaid rows in PostgreSQL with 15-minute TTL and lazy cleanup; late payment re-checks the seat | Proposed |
| D-009 | Payment gateway: hosted checkout, Razorpay | Proposed |
| D-010 | Money as `NUMERIC(10,2)` / `Decimal` / JSON string | Proposed |
| D-011 | Email provider: transactional API (Resend) | Proposed |
| D-012 | Receipts in a private S3-compatible bucket | Proposed |
| D-013 | Hosting | Open |
| D-014 | AdMob scope: banners only, three list screens, mobile only | Proposed |
| D-015 | AdMob account owner and ad revenue handling | Open |
| D-016 | Free tickets identified by `price_paid = 0` | Proposed |
| D-017 | Nobody approves their own expense | Proposed |
| D-018 | Scheduled jobs run as CLI commands on the host scheduler | Proposed |
| D-019 | Zero-dues memberships | Open |
| D-020 | Add `payments.external_ref` | Proposed |
| D-021 | Fix `event_summary` and `memberships_due_for_renewal` views | Proposed |
| D-022 | Member price per ticket holder (by email), not per buyer | Proposed |
| D-023 | Ledger start: fresh or backfill | Open |
| D-024 | Semester-wise memberships with membership types | Proposed |
| D-025 | Non-member seat limit on ticket types (a ceiling inside the total) | Proposed |
| D-026 | Non-member goodie limit, first come first served, and non-member orders | Proposed |
| D-027 | Stack: React + Vite, FastAPI, PostgreSQL, Redis | Accepted |
| D-028 | Redis is a speed layer with four jobs (cache, rate limits, one-time sign-in links, job queue); never the only copy of anything | Accepted |
| D-029 | Role-based login pages (member, officer, treasurer) | Proposed |

---

## D-001 — The brief is the scope boundary
**Date:** 2026-10-10 · **Status:** Accepted
**Context:** The requester asked to stick to the PDF and not add things.
**Decision:** Build only the six scenes in the brief. Extras need a decision entry first.
**Consequences:** Anything requested later that is not in the brief (AdMob, login, payments gateway) is recorded here with its reason.

## D-002 — PostgreSQL only
**Date:** 2026-10-10 · **Status:** Accepted
**Decision:** PostgreSQL is the single system of record: transactional data, constraints, triggers, views. Nothing that must not be lost lives anywhere else.
**Update (D-027, D-028):** you added Redis as a speed layer. It is never the only copy of anything, so this decision still holds for every record, seat holds included. The original wording said "no cache or second database".
**Consequences:** Seat-limit and money integrity rely on Postgres features (row locks, constraints, triggers), never on Redis.

## D-003 — Schema as delivered
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** One `payments` table for all income lets the treasurer see money in at a glance; child tables (`memberships`, `tickets`, `orders`) link to it.
**Decision:** Keep the tables and views in `database/schema.sql` as the baseline (`0001`). It started as 15 tables and 7 views and is now 17 tables and 7 views after `D-024`, `D-025` and `D-026`.
**Consequences:** Reservations and reconciliation need the small changes in D-020 and D-021. Verified on PostgreSQL 16 on 2026-10-10, and again after the semester and non-member changes.

## D-004 — Stack
**Date:** 2026-10-10 · **Status:** Proposed
**Decision:** Python 3.12 + FastAPI + SQLAlchemy 2 (async) + Alembic + Pydantic v2. The web part (Next.js) was replaced by React + Vite in `D-027`.
**Alternatives:** Django (more built in, heavier), Node/Express.
**Consequences:** Matches the stack you already use; Alembic gives reviewable migrations.

## D-005 — Web first, mobile in Phase 2
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** The brief asks for a website and ordering from phones. AdMob only works inside mobile apps.
**Decision:** Phase 1 ships API + responsive web. Phase 2 adds an Expo (React Native) app, which is where AdMob lives.
**Alternatives:** Mobile-only (misses the "simple website" in the brief); Flutter (new stack).
**Consequences:** Mobile reuses the same API and rules; two clients to maintain.

## D-006 — Authentication
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** The schema has no passwords, and students forget passwords.
**Decision:** Email magic link (15 min) exchanged for a 24-hour signed session. Roles resolved from the database per request.
**Alternatives:** Passwords (needs a new column and reset flow); Google sign-in (college accounts may not allow it).
**Consequences:** No schema change. No per-token revocation before expiry; rotating `JWT_SECRET` logs everyone out. Email delivery becomes critical for sign-in.
**Update (D-028, D-029):** Redis now makes links single use (`signin:{token}`, deleted on first use). Sessions stay stateless and sign-out only clears the cookie, so the "no revoke" trade-off above still stands; rotate `JWT_SECRET` in an emergency. Sign-in has three role pages.

## D-007 — Roles
**Date:** 2026-10-10 · **Status:** Proposed
**Decision:** Officer = any `leadership_roles` row for the current calendar year. Treasurer = position `Treasurer`. Everyone else is a member or visitor.
**Consequences:** Changing the elected team is just inserting rows each year; positions are free text, so `Treasurer` must be spelled consistently.

## D-008 — Reservations
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** Buyers need seats and stock held while they pay, and the schema has no reservation status.
**Decision:** Unpaid ticket rows (`payment_id` NULL, `price_paid > 0`) and `placed` orders are reservations that expire after 15 minutes. Expired ones are removed or cancelled lazily inside each purchase transaction, and by a periodic job.
**Alternatives:** Add a `status` column or a reservations table (schema change); sell seats only after payment (risk of paying for sold-out seats).
**Update (D-028):** Redis is not used for seat holds. A hold is an unpaid ticket row in PostgreSQL, kept for 15 minutes and released by the scheduled job, which never touches a paid ticket, so the last seat is always decided in one locked database step.
**Late payment:** if the gateway confirms after the hold was released, the webhook locks the ticket type and checks the seat again. If it is still free, the ticket is marked paid. If it is gone, the buyer is refunded through the gateway and told (if the refund call fails, an alert is raised and the treasurer refunds by hand). Orders keep the older rule: log, alert, refund by hand.
**Consequences:** `event_summary` must ignore reservations (D-021). The refund call to the gateway is new work (`P-07`).

## D-009 — Payment gateway
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** The brief needs online payment (tickets, merchandise, dues). The club is in India.
**Decision:** Hosted-checkout gateway, Razorpay proposed (UPI, cards, INR). Card data never touches our servers.
**Alternatives:** Stripe (availability and fees for Indian accounts vary), manual UPI screenshot (brings back "chasing payments").
**Consequences:** Needs a gateway account approved for the club (may require a registered entity or an officer's account; check). Webhook is the only thing that marks payments paid.

## D-010 — Money representation
**Date:** 2026-10-10 · **Status:** Proposed
**Decision:** `NUMERIC(10,2)` in Postgres, `Decimal` in Python, string in JSON, INR only.
**Consequences:** No floating-point rounding errors; clients format for display.

## D-011 — Email provider
**Date:** 2026-10-10 · **Status:** Proposed
**Decision:** A transactional email API (Resend proposed) for magic links, tickets, announcements, and reminders, with SPF, DKIM, DMARC on the club's domain.
**Consequences:** No per-recipient delivery log in the database (not in the brief); rely on provider dashboard and structured logs.

## D-012 — Receipt storage
**Date:** 2026-10-10 · **Status:** Proposed
**Decision:** Private S3-compatible bucket; `expenses.receipt_url` stores the object key or URL; access through signed URLs.
**Consequences:** One more service; no files in the database.

## D-013 — Hosting
**Date:** 2026-10-10 · **Status:** Open
**Question:** Where do the API and database run? Leaning: the static web build on Vercel or another static host, API in a Docker container on a managed host, managed Postgres with backups. Redis is run by the club in Docker Compose beside the API (`D-028`).
**Needed:** Budget, region (India latency), who administers it.
**Blocks:** CI-05, CI-06, L-01.

## D-014 — AdMob scope
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** AdMob was requested and is not in the brief.
**Decision:** Adaptive banners only, on Events list, Announcements list, and Shop list in the mobile app. Never on check-in, purchase, payment, ticket, or finance screens. No interstitial, app-open, or rewarded ads. Kill switch via `GET /config`.
**Alternatives:** No ads (simplest); interstitials (higher revenue, hurts door and checkout moments).
**Consequences:** Ads cannot interfere with money or the door. Web has no ads.

## D-015 — AdMob account and revenue
**Date:** 2026-10-10 · **Status:** Open
**Questions:** Who owns the AdMob account and receives payouts? Should ad income appear in treasurer totals?
**Notes:** The schema has no income category for ads. Showing it in the ledger needs a schema change (new `payments.category` value or separate table). Until decided, ad revenue is tracked outside Oddoskyline.
**Blocks:** X-11, X-12.

## D-016 — Free tickets
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** `payments.amount` must be positive, so a free ticket has no payment row.
**Decision:** A ticket is valid when `payment_id IS NOT NULL OR price_paid = 0`.
**Consequences:** Every query that checks validity must use this rule (check-in, summaries).

## D-017 — Expense approval
**Date:** 2026-10-10 · **Status:** Proposed
**Decision:** Only the treasurer approves, rejects, and reimburses, and nobody can act on their own expense; another officer must handle it.
**Consequences:** Needs at least two officers. The first treasurer's own expenses are reviewed by the president or another officer.

## D-018 — Scheduled jobs
**Date:** 2026-10-10 · **Status:** Proposed
**Decision:** Jobs are CLI commands run by the host scheduler. GitHub Actions cron is only a fallback for the daily reminder. Correctness of seat and stock holds never depends on a job (lazy cleanup). The jobs are renewal reminders (queued), release of unpaid holds (never a paid ticket) and the `send_emails` worker, which sends queued emails with retries (`D-028`).

## D-019 — Zero-dues memberships
**Date:** 2026-10-10 · **Status:** Open
**Context:** `active_members` requires a payment, and payments must be above zero, so a free membership would count as inactive.
**Options:** (a) dues always above zero, no change; (b) treat `dues_amount = 0` as active in the view.
**Needed:** Does the club ever give free or sponsored memberships?

## D-020 — `payments.external_ref`
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** Webhooks can be delivered more than once, and the treasurer will want to reconcile with the gateway statement. The schema stores no gateway reference.
**Decision:** `ALTER TABLE payments ADD COLUMN external_ref TEXT UNIQUE;` (nullable; cash payments leave it empty).
**If rejected:** Idempotency relies only on target state (already-paid rows are skipped); reconciliation is by amount and time.
**Consequences:** One small migration (`DB-01`).

## D-021 — View fixes
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** Tested on PostgreSQL 16: an unpaid ticket reservation adds its price to `event_summary.ticket_revenue`; an unpaid membership appears in `memberships_due_for_renewal`.
**Decision:** (a) `event_summary` joins only valid tickets. (b) `memberships_due_for_renewal` requires `payment_id IS NOT NULL`. `ticket_availability` keeps counting reservations against seats, since reservations must count.
**Update:** part (b) is already applied in the semester version of the view (`D-024`). Only part (a) is still open.
**Consequences:** Migration `DB-02` for part (a).

## D-022 — Member price per ticket holder
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** The brief gives different prices for members and non-members. A member buying for friends should not get member prices for them.
**Decision:** Price each ticket by its holder's email: active member ⇒ member price and `member_id` set; otherwise non-member price.
**Consequences:** Purchase form collects a name and email per ticket.

## D-023 — Ledger start
**Date:** 2026-10-10 · **Status:** Open
**Options:** Fresh ledger from the first day of the semester, or backfill past income and reimbursements with real dates. The schema has no opening-balance concept.
**Needed:** How much history the treasurer wants inside the system.

## D-024 — Semester-wise memberships with membership types
**Date:** 2026-10-10 · **Status:** Proposed (requested by you; the details below need your yes)
**Context:** You asked for membership to be semester-wise, with different types. The original schema used free-form `valid_from` and `valid_until` dates, assumed one calendar-year period, and had no types.
**Decision:**
- New `semesters` (name, start, end; no overlaps) and `membership_types` (name, dues per semester, `is_offered`).
- A membership is one member, one semester, one type. It is unique per member and semester, expires on the semester's end date, and keeps a copy of the dues at purchase.
- Active means paid, and today falls inside the semester. A paid membership for a later semester is "starts later".
- The renewal reminder goes to paid members whose semester ends within 30 days and who have not paid for a later semester.
- Type names, dues and semester dates are the club's to set. Diagrams show Basic, Plus and Premium only as example names.
- Officers manage semesters and types (the brief has no role for this, so it follows the existing "officers manage" rule).
**Alternatives:** Keep free dates and add a type column (no semester concept, easy to create overlaps); a price table per type per semester (more flexible, not needed yet).
**Consequences:** `valid_from` and `valid_until` are gone from `memberships`; the API and views expose the semester end as `valid_until`. Every type gets the same member prices, because the brief has one member price; different discounts per type would be a new decision. Free (zero-dues) types still need `D-019`.
**Open for you:** what types you want, whether a type can span more than one semester, and who can create semesters.

## D-025 — Non-member seat limit on ticket types
**Date:** 2026-10-10 · **Status:** Proposed (requested by you; the details below need your yes)
**Context:** The Spring Gala must be open to members and non-members, with a limit on the seats non-members can take.
**Decision:** `ticket_types.non_member_seat_limit`, between 0 and `seat_limit` (0 = members only). A ticket with no member counts as a non-member ticket. A sale is refused when the total is reached (`SOLD_OUT`) or when it is a non-member ticket and the non-member limit is reached (`SOLD_OUT_NON_MEMBER`). Both checks run in one locked step plus the database trigger.
**Alternatives:** Reserve a block of seats for members (guarantees members seats, needs a second number and wastes seats if members do not fill them).
**Consequences:** The limit is a ceiling inside the total, so members can use any seat that is left, and if members buy everything first, non-members see "sold out". Availability shows seats left in total and for non-members. Prices are still per ticket holder (`D-022`).
**Open for you:** is a ceiling what you want, or should some seats be kept for members?

## D-026 — Non-member goodie limit, first come first served, non-member orders
**Date:** 2026-10-10 · **Status:** Proposed (requested by you; the details below need your yes)
**Context:** Non-members should be able to get goodies such as hoodies and T-shirts, with a limit, and non-members are served first come, first served. Orders previously required a member.
**Decision:**
- `products.non_member_limit`: the most units of a product that non-members can get in total, across sizes (0 = members only, the default).
- `orders.member_id` is optional. A non-member order carries `buyer_name` and `buyer_email` and is priced at the non-member `price`.
- Units on non-member orders in status placed or paid count against the limit; cancelled and expired orders give their units back.
- First come, first served: the check happens when the order is placed, under a lock on the product, so the earlier order gets the units. An unpaid order holds its units for the 15-minute reservation window.
- Members are limited by stock only.
**Alternatives:** A per-person cap instead of a total (needs a way to identify people, and an email is easy to change); serve non-members in order of payment rather than order placement (the buyer who is slowest to pay would lose out unfairly, and stock would not be held).
**Consequences:** One new trigger and one new column; non-members cannot cancel an order themselves (it expires); the limit is on the total, so one person can place several non-member orders. Like seats, the limit is a ceiling, not reserved stock.
**Open for you:** whether the limit should be per person as well, and whether non-members may buy every product.

## D-027 — Stack: React + Vite, FastAPI, PostgreSQL, Redis
**Date:** 2026-10-10 · **Status:** Accepted (you chose it)
**Context:** You set the stack: React + Vite for the frontend, FastAPI for the backend, PostgreSQL for the database, Redis as a cache, and role-based login pages.
**Decision:**
- Web: React, Vite, TypeScript and React Router, built as a static single-page app. This replaces Next.js in `D-004`.
- API: FastAPI, unchanged. Database: PostgreSQL 16 is still the only system of record, and `database/schema.sql` does not change.
- Speed layer: Redis 7, run by the club in Docker Compose (`D-028`). This amends `D-002`, which said "no cache or second database".
- Mobile (Phase 2) and AdMob stay as proposed in `D-005` and `D-014`. Your stack list did not mention them.
**Alternatives:** Keep Next.js (not what you asked for); an in-process cache instead of Redis (not shared between API instances, lost on every deploy).
**Consequences:** The static host must send unknown paths to `index.html` so deep links work. Pages render in the browser, so public event pages are not search-engine friendly (the brief does not ask for that). The API and web share a site for the cookie, or the host proxies `/api`. `VITE_` variables are public. One more service to run.
**Open for you:** are the Expo mobile app and AdMob still wanted?

## D-028 — Redis is a speed layer with four jobs
**Date:** 2026-10-10 · **Status:** Accepted (you set it)
**Context:** You asked for Redis. The brief has no caching need of its own, so the uses are kept small and safe. PostgreSQL stays the single source of truth for every club record, seat holds included.
**Decision:** Four jobs, listed in `02_TRD.md` §3.11 and shown on the data model page as "Redis keys (temporary, not tables)":
1. **Cache:** `cache:{report_name}`, 30 to 60 s copies of `ticket_availability`, `active_members`, `club_balance` and `fundraiser_progress`. Deleted when a payment is confirmed or a ticket is checked in.
2. **Rate limits:** `rate:{endpoint}:{ip}`, request counters (1 min) on sign-in email links, ticket purchase and shop orders.
3. **One-time sign-in links:** `signin:{token}`, 15 min, deleted on first use.
4. **Job queue:** `queue:emails`, renewal reminders, announcement emails, ticket QR emails and sign-in link emails, so the API replies fast. A failed email is retried up to 3 times, then logged.
Redis is not used for seat holds: a hold is an unpaid ticket row in PostgreSQL, kept for 15 minutes and released by the scheduled job. Redis never holds the only copy of anything. If it is empty, wrong or down, the club loses no record, and buying, ordering and door check-in still work, checked directly in the database (slower). Redis runs in the club's Docker Compose, not as an outside service. It adds no table: the schema stays at 17 tables and 7 views.
**Alternatives:** Cache only, with nothing about sign-in in Redis (simpler, but links stay reusable for 15 minutes); rate limits in memory (wrong with more than one API instance); seat holds in Redis (faster, but a lost key would free a seat someone is paying for).
**Consequences:**
- Reports can be up to 60 s old; purchase and check-in never read them.
- Sign-in has two dependencies, email and Redis: while Redis is down, new sign-in links answer `503`.
- Sessions are stateless and logout only clears the cookie, so a session stays valid until its 24 h expiry (`D-006`).
- Idempotency-Key results no longer have a home in Redis. Where they are kept is open, and a new table would make 18 (`D-020`'s target-state rule still protects webhooks).
- Page caches for events, shop and announcements are gone; only the four reports are cached.
- The per-email hourly limit and the email lock after failed exchanges are dropped; limits are per minute per IP on the three endpoints.
- Queued emails put recipient addresses in Redis, so it must be private with a password.
- A late ticket payment now triggers an automatic gateway refund when the seat is gone.
**Open for you:** is it acceptable that sign-in needs Redis? Where should Idempotency-Key results be stored?

## D-029 — Role-based login pages
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** You asked for role-based (RBAC) login pages. The schema has no passwords (`D-006`), and roles come from `leadership_roles` (`D-007`).
**Decision:** Three login pages, `/login` (member), `/officer/login` and `/treasurer/login`, all using the email-link flow. Roles nest (Treasurer includes Officer includes Member) and are read from PostgreSQL on every request. `portal` only picks the landing page. The API enforces roles on every endpoint; the web route guards only hide screens. Officer and treasurer accounts exist only through `leadership_roles`, so their pages have no sign-up.
**Alternatives:** Email and password (needs `members.password_hash`, a reset flow and lockouts, which is a schema change); one shared login page that redirects by role (simpler, but you asked for role pages); roles stored in the token (stale for up to 24 h after an officer is removed).
**Consequences:** No schema change. Signing in on the wrong page gives "No access" and a link to the person's own area. Passwords later would be a new decision and one new column.
**Open for you:** link-only sign-in or passwords, and whether the treasurer may also use the officer page (proposed: yes).

---

## Template
```
## D-0NN — Title
**Date:** YYYY-MM-DD · **Status:** Proposed
**Context:** What forces this decision?
**Decision:** What we will do.
**Alternatives:** What else we considered.
**Consequences:** What gets easier, harder, or must change (docs, schema, tests).
```
