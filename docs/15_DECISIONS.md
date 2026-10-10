# 15 — Decisions

A log of choices that shape the system. Add an entry **before** building anything not covered by the brief (`00_MASTER_RULES.md` §2).

**Status values:** `Accepted` (agreed, build on it) · `Proposed` (my recommendation, needs your yes) · `Open` (needs input, no recommendation yet) · `Superseded by D-xxx`.
Only D-001 and D-002 are accepted so far; everything else is proposed for review. Flip the status in the same PR that acts on it.

## Index
| ID | Decision | Status |
|---|---|---|
| D-001 | The brief (PDF) is the scope boundary | Accepted |
| D-002 | PostgreSQL is the only datastore | Accepted |
| D-003 | Schema design as delivered in `schema.sql` | Proposed |
| D-004 | Backend FastAPI + SQLAlchemy 2 + Alembic; web Next.js | Proposed |
| D-005 | Web first, Expo mobile app in Phase 2 | Proposed |
| D-006 | Passwordless magic-link auth with stateless tokens | Proposed |
| D-007 | Roles derived from `leadership_roles` for the current year | Proposed |
| D-008 | Reservations as unpaid rows with 15-minute TTL and lazy cleanup | Proposed |
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

---

## D-001 — The brief is the scope boundary
**Date:** 2026-10-10 · **Status:** Accepted
**Context:** The requester asked to stick to the PDF and not add things.
**Decision:** Build only the six scenes in the brief. Extras need a decision entry first.
**Consequences:** Anything requested later that is not in the brief (AdMob, login, payments gateway) is recorded here with its reason.

## D-002 — PostgreSQL only
**Date:** 2026-10-10 · **Status:** Accepted
**Decision:** PostgreSQL is the single datastore: transactional data, constraints, trigger, views. No cache or second database.
**Consequences:** Seat-limit and money integrity rely on Postgres features (row locks, constraints, triggers).

## D-003 — Schema as delivered
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** One `payments` table for all income lets the treasurer see money in at a glance; child tables (`memberships`, `tickets`, `orders`) link to it.
**Decision:** Keep the 15 tables and 7 views in `database/schema.sql` as the baseline (`0001`).
**Consequences:** Reservations and reconciliation need the small changes in D-020 and D-021. Verified on PostgreSQL 16 on 2026-10-10.

## D-004 — Stack
**Date:** 2026-10-10 · **Status:** Proposed
**Decision:** Python 3.12 + FastAPI + SQLAlchemy 2 (async) + Alembic + Pydantic v2; Next.js (TypeScript) for web.
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

## D-007 — Roles
**Date:** 2026-10-10 · **Status:** Proposed
**Decision:** Officer = any `leadership_roles` row for the current calendar year. Treasurer = position `Treasurer`. Everyone else is a member or visitor.
**Consequences:** Changing the elected team is just inserting rows each year; positions are free text, so `Treasurer` must be spelled consistently.

## D-008 — Reservations
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** Buyers need seats and stock held while they pay, and the schema has no reservation status.
**Decision:** Unpaid ticket rows (`payment_id` NULL, `price_paid > 0`) and `placed` orders are reservations that expire after 15 minutes. Expired ones are removed or cancelled lazily inside each purchase transaction, and by a periodic job.
**Alternatives:** Add a `status` column or a reservations table (schema change); sell seats only after payment (risk of paying for sold-out seats).
**Consequences:** `event_summary` must ignore reservations (D-021). Late payments after expiry need a refund runbook.

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
**Question:** Where do the API and database run? Leaning: web on Vercel, API in a Docker container on a managed host, managed Postgres with backups.
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
**Notes:** The schema has no income category for ads. Showing it in the ledger needs a schema change (new `payments.category` value or separate table). Until decided, ad revenue is tracked outside SOS.
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
**Decision:** Jobs are CLI commands run by the host scheduler. GitHub Actions cron is only a fallback for the daily reminder. Correctness of seat and stock holds never depends on a job (lazy cleanup).

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
**Decision:** (a) `event_summary` joins only valid tickets. (b) `memberships_due_for_renewal` requires `payment_id IS NOT NULL`. `ticket_availability` stays as is, since reservations must count against seats.
**Consequences:** Migration `DB-02`. Until then the reminder job filters paid memberships in code.

## D-022 — Member price per ticket holder
**Date:** 2026-10-10 · **Status:** Proposed
**Context:** The brief gives different prices for members and non-members. A member buying for friends should not get member prices for them.
**Decision:** Price each ticket by its holder's email: active member ⇒ member price and `member_id` set; otherwise non-member price.
**Consequences:** Purchase form collects a name and email per ticket.

## D-023 — Ledger start
**Date:** 2026-10-10 · **Status:** Open
**Options:** Fresh ledger from the first day of the semester, or backfill past income and reimbursements with real dates. The schema has no opening-balance concept.
**Needed:** How much history the treasurer wants inside the system.

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
