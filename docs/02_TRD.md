# 02 — Technical Requirements Document (TRD)

How the PRD is built. IDs refer to `01_PRD.md`; decisions to `15_DECISIONS.md`.

## 1. Technology
| Concern | Choice | Decision |
|---|---|---|
| Database | PostgreSQL 16 | D-002 |
| API | Python 3.12, FastAPI, Pydantic v2 | D-004 |
| Data access | SQLAlchemy 2.x (async, asyncpg) + Alembic | D-004 |
| Web | React, Vite, TypeScript, React Router (single-page app) | D-027 |
| Speed layer | Redis 7, run by the club in Docker Compose: report copies, rate limits, one-time sign-in links, email queue. Never the source of truth | D-027, D-028 |
| Login | Email magic link, three role-based login pages (member, officer, treasurer) | D-006, D-029 |
| Mobile (Phase 2) | Expo / React Native, `react-native-google-mobile-ads` | D-005 |
| Payments | Hosted-checkout gateway (Razorpay proposed) | D-009 |
| Email | Transactional email API (Resend proposed) | D-011 |
| Receipt storage | Private S3-compatible bucket | D-012 |
| Errors / logs | Sentry + structured JSON logs | — |
| CI | GitHub Actions | `11_GITHUB_ACTIONS.md` |

## 2. Non-functional requirements
| Area | Target |
|---|---|
| Check-in latency | p95 < 300 ms server time |
| API latency | p95 < 500 ms for reads, < 1 s for writes |
| Event page | Loads in < 2 s on 4G |
| Availability | 99% monthly (volunteer-run club; no pager) |
| Concurrency | No oversell of seats or stock under parallel requests |
| Backups | Daily automated backups, 14-day retention, restore tested before launch |
| Accessibility | WCAG 2.1 AA for web |
| Browser / OS | Last two versions of Chrome, Safari, Edge; Android 8+, iOS 15+ |
| Currency / locale | INR, English, `Asia/Kolkata` display time (stored UTC) |

## 3. Core business rules (the logic that must be exactly right)

### 3.1 Active membership
Memberships are semester-wise (`D-024`). A member is **active** on date *d* when a `memberships` row has `payment_id IS NOT NULL` and *d* falls between the `starts_on` and `ends_on` of its `semesters` row (inclusive). The membership type does not change this. This is the `active_members` view.

- A member holds at most one membership per semester (`UNIQUE (member_id, semester_id)`).
- Semesters cannot overlap (exclusion constraint) and are created by officers.
- `memberships.dues_amount` is copied from `membership_types.dues_amount` at purchase, so changing a type's dues never alters old memberships.
- A member may buy the **next** semester early. It is paid but not yet active until the semester starts.
- Renewal: a paid membership whose semester ends within 30 days, with no paid membership for a later semester, gets one reminder (`memberships_due_for_renewal`).

### 3.2 Price selection (MEM-5, TIX-2, MER-2)
- Ticket: per holder email. Active member (any type) ⇒ `member_price`, `tickets.member_id` set. Otherwise `non_member_price`, `member_id` NULL, and the ticket uses a non-member seat.
- Goodies: member orders have `orders.member_id` set and use `member_price`. A buyer who is not an active member orders as a non-member: `price`, `orders.member_id` NULL, `buyer_name` and `buyer_email` required.
- Price is copied into `tickets.price_paid` / `order_items.unit_price` at purchase time, so later price edits never change history.

### 3.3 Seat limits (TIX-3)
Two limits per ticket type: `seat_limit` (all tickets) and `non_member_seat_limit` (tickets with `member_id IS NULL`, at most `seat_limit`; 0 = members only). The non-member limit is a ceiling inside the total, not a reserved block (`D-025`).

Layered protection:
1. Service locks the `ticket_types` row (`SELECT … FOR UPDATE`), counts all tickets and non-member tickets, rejects when either limit is reached.
2. The `enforce_seat_limit` trigger in `schema.sql` checks both limits and is the final backstop. Its errors are mapped to `SOLD_OUT` and `SOLD_OUT_NON_MEMBER`.
3. Expired reservations for the ticket type are deleted first (§3.4), so held seats are released before counting.

### 3.4 Reservations (no schema change)
A purchase must hold seats / stock while the buyer pays.
- **Ticket reservation** = a `tickets` row with `payment_id IS NULL AND price_paid > 0`.
- **Order reservation** = an `orders` row with `status = 'placed'` and `payment_id IS NULL`.
- Reservations expire after `RESERVATION_TTL_MINUTES` (default 15).
- **Lazy cleanup:** before every seat or stock check, the same transaction deletes expired ticket reservations for that ticket type, or cancels expired orders for the affected variants and restores stock. A periodic job repeats this, but correctness never depends on the job running. The job never touches a paid ticket (`payment_id IS NOT NULL`) or a paid order.
- **Holds live only in PostgreSQL.** Redis is not used for seat holds, so the last seat is always decided in one locked database step (§3.3).
- A ticket is **valid** when `payment_id IS NOT NULL OR price_paid = 0` (free tickets have no payment row because `payments.amount > 0`).

### 3.5 Stock (MER-4)
```sql
UPDATE product_variants
SET stock_quantity = stock_quantity - :qty
WHERE variant_id = :id AND stock_quantity >= :qty;   -- 0 rows updated => INSUFFICIENT_STOCK
```
On cancel or expiry: `stock_quantity = stock_quantity + qty`, in the same transaction that sets `status = 'cancelled'`.

### 3.5a Non-member goodie limit, first come first served (MER-6)
`products.non_member_limit` is the most units of a product that non-member orders can hold in total across all its sizes (0 = members only; `D-026`). Members are limited by stock only.
- **Counting:** units in `order_items` of orders with `member_id IS NULL` and `status IN ('placed','paid')`. Cancelled and expired orders do not count, so their units go back to the quota.
- **First come, first served:** the order line is checked at the moment the order is placed, under a lock on the `products` row, so the order that arrives first gets the units and a later one is refused with `NON_MEMBER_LIMIT_REACHED`. Unpaid orders hold their units for the reservation window (§3.4); when a hold expires the next buyer can take them.
- **Backstop:** the `enforce_non_member_goodie_limit` trigger on `order_items` runs the same check. Stock is then reduced with the atomic update above.
- Both checks must pass for a non-member: quota first, then stock.

### 3.6 Check-in (TIX-6)
```sql
UPDATE tickets t
SET checked_in_at = now(), checked_in_by = :officer_id
FROM ticket_types tt
WHERE tt.ticket_type_id = t.ticket_type_id
  AND tt.event_id = :event_id
  AND t.ticket_code = :code
  AND t.checked_in_at IS NULL
  AND (t.payment_id IS NOT NULL OR t.price_paid = 0)
RETURNING t.ticket_id;
```
Zero rows ⇒ a follow-up `SELECT` decides the exact error: `TICKET_NOT_FOUND`, `TICKET_ALREADY_CHECKED_IN`, `TICKET_UNPAID`, or `TICKET_WRONG_EVENT`. Single statement ⇒ two simultaneous scans cannot both succeed.

### 3.7 Payments
1. Server creates the order with the gateway for the exact computed total and stores the reference in the gateway's metadata (target type and IDs).
2. Buyer pays on the gateway's hosted page. No card data touches our servers.
3. Gateway calls `POST /api/v1/webhooks/payment`. We verify the signature, then in one transaction insert a `payments` row and set `payment_id` on the targets (memberships, tickets, or orders; set order `status = 'paid'`).
4. **Idempotency:** the webhook is processed only if targets are still unpaid, and `payments.external_ref` (proposed, `D-020`) is unique. Retries do nothing.
5. **Late payment for tickets** (the gateway confirms after the 15-minute hold has been released): the webhook locks the ticket type and checks the seat again in the database in one step, both the total and, for a non-member holder, the non-member seats. The gateway order carries the holders, ticket type and prices, so the tickets can be rebuilt. If the seat is still free, the ticket is marked paid. If it is gone, the buyer is refunded through the gateway and told by email (queued, `queue:emails`), and `late_payment` is logged. If the refund call itself fails, alert and refund by hand from the gateway dashboard (runbook in `13_PRODUCTION_CHECKLIST.md`).
   **Late payment for orders** (hoodies): unchanged. Log, alert, refund by hand.
6. Cash: officer-only endpoint inserts `payments` with `method = 'cash'` and links targets in one transaction.

### 3.8 Treasurer arithmetic (TRS-1…5)
- Money in = `SUM(payments.amount)` grouped by `category`.
- Money out = `SUM(expenses.amount) WHERE status = 'reimbursed'`.
- Balance = in − out (`club_balance` view).
- Outstanding = memberships with `payment_id IS NULL`, orders `placed`, expenses `approved` and not reimbursed.

### 3.9 Expense workflow
`submitted → approved | rejected`, `approved → reimbursed`. Only the treasurer transitions; never on one's own expense (`SELF_APPROVAL_NOT_ALLOWED`). `reimbursed_at` is set exactly when status becomes `reimbursed`.

### 3.10 Announcements
Insert the row, then queue one email per member address in `queue:emails` (§3.11). Post success does not depend on email success; failed sends are retried (up to 3 attempts, exponential backoff), then logged as `email_failed`.

### 3.11 Redis: the speed layer (`D-028`)
PostgreSQL is the single source of truth for every club record, including seat holds. Redis is a speed layer only, with four jobs, and it never holds the only copy of anything. If Redis is empty, wrong or down, the club loses no record, and buying, ordering and door check-in still work, checked directly in the database (slower).

| Job | Key pattern (prefix `oddo:v1:`) | Holds | Lives |
|---|---|---|---|
| 1. Cache | `cache:{report_name}` | Copy of `ticket_availability`, `active_members`, `club_balance` or `fundraiser_progress` | 30 to 60 s; deleted when a payment is confirmed or a ticket is checked in |
| 2. Rate limits | `rate:{endpoint}:{ip}` | Request counter for sign-in email links, ticket purchase and shop orders | 1 min |
| 3. One-time sign-in links | `signin:{token}` | One sign-in link, deleted on first use. `{token}` is a hash of the emailed token, so reading Redis does not reveal a usable link | 15 min |
| 4. Job queue | `queue:emails` | Emails waiting to be sent: renewal reminders, announcement emails, ticket QR emails, sign-in link emails | Until sent |

Rules:
1. **Seat holds are not in Redis.** A hold is an unpaid ticket row in PostgreSQL, kept for 15 minutes and released by the scheduled job (§3.4, §4). Redis is not used for seat holds, so the last seat is always decided in one locked database step (§3.3).
2. **Never decide from Redis.** Seat and stock checks, prices, payments, check-in and role lookups read PostgreSQL inside the transaction. A cached report may be up to 60 s old; the purchase still checks the real numbers and answers `SOLD_OUT`, `SOLD_OUT_NON_MEMBER`, `INSUFFICIENT_STOCK` or `NON_MEMBER_LIMIT_REACHED` when they are gone.
3. **Cache is read-through.** On a miss read the view from PostgreSQL, store the JSON, return it. The webhook that confirms a payment and the check-in endpoint delete the four `cache:` keys after their transaction commits, never before.
4. **TTLs.** Every key has a TTL except `queue:emails`, a list that empties as emails are sent. Redis runs with `maxmemory-policy volatile-lru`.
5. **Email queue.** The API puts the email on `queue:emails` and replies at once; a worker sends it. A failed send is retried up to 3 times (1 min, 5 min, 30 min), then logged as `email_failed`. A lost queue entry loses a pending email, never a record: the announcement is on the site, the ticket is under My tickets, a sign-in link can be requested again, and `renewal_reminders` queues any membership whose `renewal_reminder_sent_at` is still empty (it is set only after the email is sent).
6. **If Redis is unreachable:** reports are read from PostgreSQL; rate limits are skipped and logged; ticket and announcement emails are sent straight from the API with one attempt (failure logged as `email_failed`); requesting or using a sign-in link answers `SERVICE_UNAVAILABLE`, because a link cannot be made one-time without Redis. Existing sessions, ticket purchase, orders and door check-in keep working. Payments are marked only by the verified webhook.

### 3.12 Roles and login pages (`D-029`)
Roles are resolved from PostgreSQL on every request (`D-007`) and nest: Treasurer includes Officer, Officer includes Member, Member includes Visitor.

| Login page | For | Lands on |
|---|---|---|
| `/login` | Members, and visitors who sign up | My stuff |
| `/officer/login` | Elected officers | Manage |
| `/treasurer/login` | The treasurer | Treasurer dashboard |

1. All three pages use the same magic-link flow: `POST /auth/magic-link {email, portal}`, the emailed link opens `/auth/callback`, which calls `POST /auth/token`, then `GET /me` returns every role the person holds.
2. `portal` (`member`, `officer`, `treasurer`) only decides which login page the link returns to and where the person lands. It never grants anything.
3. A person who signs in on a page whose role they do not hold stays signed in as a member (if they are one) and sees a "no access" message with a link to their own area.
4. The web app hides routes the person's roles do not allow (route guards, for convenience). Every API endpoint enforces its own role with a `require_role` dependency, and a test asserts it (`12_TESTING.md`).
5. Officer and treasurer accounts are not created on the login pages. The elected team is entered under `leadership_roles` (MEM-6); sign-up exists only on the member page.

## 4. Scheduled jobs
Run as CLI commands (`python -m app.jobs.<name>`) from the host's scheduler. GitHub Actions cron is best-effort and used only as a fallback for the daily job.
| Job | Frequency | Does |
|---|---|---|
| `renewal_reminders` | Daily | Queue an email for each member in `memberships_due_for_renewal` (paid, semester ends within 30 days, no paid later semester; the view already filters paid memberships, `D-021` part b), the `send_emails` worker sets `renewal_reminder_sent_at` only after the email is sent |
| `expire_reservations` | Every 5 min | Delete expired unpaid ticket reservations (never a paid ticket); cancel expired orders and restore stock |
| `send_emails` | Continuous worker | Take emails from `queue:emails`, send them, retry up to 3 times, then log `email_failed` (§3.11). Renewal reminders, announcement emails, ticket QR emails and sign-in link emails all go through it |

## 5. Configuration (environment variables)
`APP_ENV`, `DATABASE_URL`, `REDIS_URL`, `CACHE_ENABLED` (true), `JWT_SECRET`, `SESSION_TTL_MINUTES` (1440), `MAGIC_LINK_TTL_MINUTES` (15), `RESERVATION_TTL_MINUTES` (15), `TICKET_MAX_PER_PURCHASE` (10), `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `EMAIL_API_KEY`, `EMAIL_FROM`, `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `CORS_ORIGINS`, `SENTRY_DSN`, `ADS_ENABLED`.
Web: `VITE_API_BASE_URL` (build-time and public: never put a secret in a `VITE_` variable). Mobile: `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_ADMOB_*` (see `10_ADMOB.md`).

## 6. Environments
| Env | Purpose | DB | Payments | Ads |
|---|---|---|---|---|
| local | Development, `docker compose` Postgres and Redis | local | gateway test mode | test IDs |
| staging | Pre-release checks | separate DB and Redis | test mode | test IDs |
| production | Real club | managed Postgres + backups; Redis in the club's Docker Compose | live | real IDs |

## 7. Repository layout
```
/database        schema.sql (baseline = migration 0001)
/backend         FastAPI app: api/ services/ repositories/ models/ schemas/ core/ jobs/
/web             React + Vite app (src/ pages/ components/ auth/ api/)
/mobile          Expo app (Phase 2)
/docs            these documents
/.github         workflows
CHANGELOG.md
```

## 8. Technical risks
| Risk | Mitigation |
|---|---|
| Oversell under load | Row lock + trigger + race test (`12_TESTING.md`) |
| Paid but reservation expired | Lazy + job cleanup; the webhook re-checks the seat in one locked step (paid if free, refunded and told if gone); alert if the refund call fails |
| Webhook retries or spoofing | Signature check, idempotent processing |
| Email provider outage | Retry with backoff; announcements still visible on site |
| Schema drift between docs and DB | Migrations only; CI applies schema from scratch |
| Stale numbers on a cached report | 30 to 60 s TTL, keys deleted on payment confirmation and check-in, the purchase re-checks the real numbers |
| Redis empty, wrong or down on gala night | Reports fall back to PostgreSQL; purchase, orders and check-in never use Redis to decide, so they work; only new sign-in links stop (drill in `13_PRODUCTION_CHECKLIST.md`) |
| A role page mistaken for protection | Route guards are convenience only; every endpoint enforces its role and the authorization matrix test covers all of them |
