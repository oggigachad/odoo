# 04 — Data Model

**Source of truth:** `database/schema.sql` (PostgreSQL 16). This document explains it; if they disagree, the SQL wins and this file gets fixed. After migration `0001` exists, all changes go through Alembic.

**Not in this schema:** Redis (`D-027`, `D-028`) is a speed layer with four jobs: `cache:{report_name}` (30 to 60 s copy of a report), `rate:{endpoint}:{ip}` (request counter, 1 min), `signin:{token}` (one-time sign-in link, 15 min) and `queue:emails` (emails waiting to be sent, until sent). These are temporary keys, not tables, and none of it is a record, so the schema stays at 17 tables and 7 views. Seat holds are not in Redis: a hold is an unpaid ticket row in PostgreSQL (see Ticket below).

## 1. Entity relationship diagram
```mermaid
erDiagram
    members ||--o{ leadership_roles : holds
    members ||--o{ memberships : has
    semesters ||--o{ memberships : "is bought for"
    membership_types ||--o{ memberships : "is of type"
    members ||--o{ payments : makes
    members ||--o{ tickets : "holds / checks in"
    members ||--o{ announcements : posts
    members |o--o{ orders : "places (none = non-member)"
    members ||--o{ fundraiser_tasks : "assigned to"
    members ||--o{ expenses : submits
    payments ||--o| memberships : pays
    payments ||--o{ tickets : pays
    payments ||--o| orders : pays
    fundraisers ||--o{ payments : "raises"
    fundraisers ||--o{ fundraiser_tasks : contains
    fundraisers ||--o{ expenses : "incurs"
    events ||--o{ ticket_types : offers
    events ||--o{ expenses : "incurs"
    ticket_types ||--o{ tickets : issues
    products ||--o{ product_variants : "comes in"
    product_variants ||--o{ order_items : "ordered as"
    orders ||--o{ order_items : contains
```

## 2. Tables
| Table | Purpose | Key columns and rules | Requirements |
|---|---|---|---|
| `members` | Everyone who signs up; also the mailing list | `email` unique on `LOWER(email)`; `joined_on` | MEM-1, ANN-2 |
| `leadership_roles` | Elected team per year | unique `(member_id, position, term_year)` | MEM-6 |
| `semesters` | A named date range, e.g. Fall 2026 | `name` unique; `ends_on > starts_on`; no two semesters overlap (exclusion constraint) | MEM-7 |
| `membership_types` | What can be bought for a semester | `name` unique (case-insensitive); `dues_amount ≥ 0` per semester; `is_offered` stops new sales without touching history | MEM-7 |
| `memberships` | One member, one semester, one type | unique `(member_id, semester_id)`; `dues_amount` copied from the type at purchase; `payment_id` NULL = unpaid; `renewal_reminder_sent_at` | MEM-2, MEM-3 |
| `payments` | **Every rupee in** | `category` in dues/ticket/merchandise/fundraiser; `amount > 0`; `method` cash/online; `fundraiser_id` set iff category is fundraiser | TRS-1 |
| `events` | Events such as the Spring Gala | `starts_at` | TIX-1 |
| `ticket_types` | Prices and seats for an event | `member_price`, `non_member_price` ≥ 0; `seat_limit > 0`; `non_member_seat_limit` between 0 and `seat_limit`; unique `(event_id, name)` | TIX-1, TIX-4 |
| `tickets` | One row per seat sold or reserved | `ticket_code` UUID unique; `member_id` NULL = non-member; `price_paid`; `payment_id`; `checked_in_at`, `checked_in_by`; seat-limit trigger (total and non-member) | TIX-2…6 |
| `announcements` | Record of what was said and when | `posted_by`, `posted_at` | ANN-1, ANN-3 |
| `products` | Goodies: hoodies, T-shirts | `price` (non-member), `member_price`; `non_member_limit ≥ 0` = most units non-members can get in total (0 = members only) | MER-1, MER-6 |
| `product_variants` | Sizes and stock | unique `(product_id, size)`; `stock_quantity ≥ 0` | MER-1, MER-4 |
| `orders` | A merch order by a member or a non-member | `member_id` NULL = non-member, then `buyer_name` and `buyer_email` are required; `status` placed/paid/cancelled; `payment_id` | MER-2, MER-3 |
| `order_items` | Lines of an order | PK `(order_id, variant_id)`; `quantity > 0`; `unit_price`; non-member limit trigger | MER-2, MER-6 |
| `fundraisers` | Bake sale and similar | `goal_amount` optional | FUN-1 |
| `fundraiser_tasks` | Who does what | `status` todo/in_progress/done; `assigned_to`; `due_date` | FUN-2 |
| `expenses` | Money out | `status` submitted/approved/reimbursed/rejected; `reimbursed_at` set iff reimbursed; `receipt_url`; optional `event_id`, `fundraiser_id` | TRS-2, TRS-3 |

## 3. Views (read models)
| View | Answers |
|---|---|
| `active_members` | Is this person a member today? Paid, and today is inside the semester; shows semester, type and end date (MEM-4) |
| `memberships_due_for_renewal` | Who needs a reminder: paid, semester ends within 30 days, no paid later semester, none sent (MEM-3) |
| `ticket_availability` | Seats sold and left per ticket type, in total and for non-members (TIX-4) |
| `event_summary` | Tickets sold, attended, revenue per event (TIX-7) |
| `fundraiser_progress` | Tasks done vs total, amount raised vs goal (FUN-3) |
| `treasurer_summary` | Money in by category and reimbursed money out (TRS-1, TRS-4) |
| `club_balance` | One number: in − out (TRS-4) |

## 4. State machines
| Thing | States and transitions |
|---|---|
| Membership | unpaid (`payment_id` NULL) → paid, not started (semester in the future) → active (paid, today inside the semester) → expired. Only `payment_id` is stored; the stage comes from the semester dates, never from a status column. |
| Ticket | reserved (`payment_id` NULL, `price_paid > 0`) → valid → checked in. Free ticket (`price_paid = 0`) is valid immediately. An unpaid ticket is kept for 15 minutes in PostgreSQL, then the scheduled job deletes it; the job never touches a paid ticket. If the gateway confirms after the release, the seat is checked again under a lock and the ticket is marked paid, or the buyer is refunded. |
| Order | `placed → paid`, `placed → cancelled` |
| Expense | `submitted → approved → reimbursed`, `submitted → rejected` |
| Task | `todo → in_progress → done` (may move back) |

## 5. Invariants the database already enforces
- No duplicate member emails (case-insensitive).
- No negative prices, stock, or amounts; seat limit and quantities positive.
- A payment is linked to a fundraiser if and only if its category is `fundraiser`.
- An expense has `reimbursed_at` if and only if its status is `reimbursed`.
- Tickets cannot exceed `seat_limit`, and non-member tickets (`member_id` NULL) cannot exceed `non_member_seat_limit` (trigger, serialised by a row lock on the ticket type).
- Units on non-member orders (placed or paid) cannot exceed a product's `non_member_limit` (trigger, serialised by a row lock on the product).
- Semesters cannot overlap, and a member has at most one membership per semester.
- A non-member order must carry a buyer name and email.
- Deleting an order cascades to its items; deleting a fundraiser cascades to its tasks. Everything else is restricted.

## 6. Invariants the application must enforce
- A payment's `category` matches what it pays (dues ↔ membership, ticket ↔ tickets, merchandise ↔ order).
- A ticket's `price_paid` equals the price rule in `02_TRD.md` §3.2 at purchase time.
- `payments.amount` equals the sum of what it pays for.
- Lowering `seat_limit` or `non_member_seat_limit` below tickets already sold, or `non_member_limit` below units already taken, is rejected.
- `memberships.dues_amount` equals the type's dues when the membership is created.
- Stock is restored when an order is cancelled or its reservation expires (non-member units return to the quota automatically, because the quota only counts placed and paid orders).
- Financial rows are never deleted through the API (the only deletions are expired unpaid reservations).

## 7. Known limitations of the current schema
1. **Zero-dues memberships** would show as inactive in `active_members`, because activity requires a payment and `payments.amount > 0`. Dues are expected to be above zero (`D-019`).
2. **Reservations and `event_summary`:** the view counts every ticket row, so unpaid reservations inflate `tickets_sold` and `ticket_revenue` until they expire (verified). Fix proposed below.
3. **No gateway reference** on `payments`, so reconciling with the gateway statement is manual. Fix proposed below.
4. **No opening balance:** history before go-live must be imported as dated payments and expenses, or the ledger starts fresh (`05_DATA_SOURCE.md`).
5. **No per-recipient email log** for announcements.
6. ~~Renewal view includes unpaid memberships.~~ Fixed in the semester version of `memberships_due_for_renewal` (it now requires a payment).
7. **Type and discount:** all membership types get the same member prices, because the brief has one member price. Per-type discounts would need a price per type and a decision (`D-024`).
8. **Non-member limits are ceilings:** `non_member_seat_limit` does not reserve seats for non-members, and `non_member_limit` does not reserve stock. If members buy everything first, non-members find the item sold out (`D-025`, `D-026`).
9. **Non-member identity is only a name and an email,** so one person can place several non-member orders. The limit is on the total, not per person (`D-026`).

## 8. Proposed changes (not applied; need acceptance in `15_DECISIONS.md`)
| ID | Change | Why |
|---|---|---|
| D-020 | `ALTER TABLE payments ADD COLUMN external_ref TEXT UNIQUE;` | Idempotent webhooks, reconciliation against the gateway statement |
| D-021 | (a) Recreate `event_summary` counting only valid tickets (`t.payment_id IS NOT NULL OR t.price_paid = 0` in the join). (b) ~~Add `ms.payment_id IS NOT NULL` to `memberships_due_for_renewal`~~ already included in the semester version of the view. | (a) Correct sold, attended, revenue figures: verified that one unpaid reservation currently adds its price to revenue |

Keep `ticket_availability` counting reservations: they **must** count against seats.

## 8a. Changes made for semester memberships and non-member limits (`D-024`, `D-025`, `D-026`)
Applied in `database/schema.sql` and verified on PostgreSQL 16:
| Change | Detail |
|---|---|
| New `semesters`, `membership_types` | See §2 |
| `memberships` | `valid_from`, `valid_until` replaced by `semester_id`, `membership_type_id`; unique per member and semester |
| `ticket_types` | New `non_member_seat_limit`; `enforce_seat_limit` checks it |
| `products` | New `non_member_limit` (default 0 = members only) |
| `orders` | `member_id` now optional; new `buyer_name`, `buyer_email`; check that a non-member order has both |
| `order_items` | New trigger `enforce_non_member_goodie_limit` |
| Views | `active_members`, `memberships_due_for_renewal` and `ticket_availability` rewritten |
Tables: 17. Views: 7 (unchanged count).

## 9. Migration policy
- `0001_baseline` runs `database/schema.sql`.
- Each later change is one Alembic revision with an `upgrade` and a `downgrade`.
- CI builds an empty database from migrations on every pull request.
- Production migrations run before the new API version starts, and must be backward compatible with the previous version for one release.
