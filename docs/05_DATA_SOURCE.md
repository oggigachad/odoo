# 05 — Data Source

Where every piece of data comes from, who owns it, and how existing club data gets in.

## 1. System of record
PostgreSQL is the only source of truth. Spreadsheets, notebooks and WhatsApp stop being records after go-live. Seat holds are unpaid ticket rows in PostgreSQL, not in Redis. Redis is a speed layer only (report copies, rate-limit counters, one-time sign-in links, the email queue); it can be wiped at any time without losing a record.

| Data | Created by | Owner (can change it) | Entry path |
|---|---|---|---|
| Member profile | Member or officer | Member (own), officers | Web / mobile sign-up, officer form |
| Semesters and membership types | Officer | Officers | Semester and type manager, once per term |
| Membership and dues | Officer or member | Officers | Officer form, online dues payment (one semester, one type) |
| Leadership roles | Officer | Officers | Admin screen, once per election |
| Events, ticket types | Officer | Officers | Event manager |
| Tickets | Buyer | System | Purchase flow (online) |
| Check-ins | Officer at the door | System | Scan / type code |
| Announcements | Officer | Author | Composer |
| Products, sizes, stock | Officer | Officers | Shop manager |
| Orders | Member or non-member (name and email) | System | Shop checkout |
| Fundraisers, tasks | Officer; assignee updates status | Officers, assignee | Fundraiser board |
| Payments (online) | Gateway webhook | System only | Verified webhook |
| Payments (cash) | Officer | Officers | Cash payment form |
| Expenses | Volunteer | Treasurer (status) | Expense form |
| Receipts (files) | Volunteer | Treasurer | Signed upload to storage |

## 2. External sources
| Source | Direction | Data | Trust |
|---|---|---|---|
| Payment gateway | In (webhook), out (create order) | Payment success, amount, reference | Verify HMAC signature; never trust the browser redirect |
| Email provider | Out | Message to member emails | Failures retried; no inbound data |
| Receipt storage | In (uploads) | Image / PDF ≤ 5 MB | Private bucket; type and size validated |
| Redis (run by the club, in Docker Compose) | In and out (API and jobs only) | 30 to 60 s copies of four reports, rate-limit counters, one-time sign-in links, emails waiting to be sent | Not a record: every key has a TTL except the email queue, and nothing in it is the only copy (`02_TRD.md` §3.11) |
| AdMob (Phase 2) | Out (ad requests from device) | None stored in Oddoskyline | Revenue lives in the AdMob account, not in the database |

## 3. Importing the club's existing data (one-time scripts, not product features)
### 3.1 Members spreadsheet → `members`
CSV columns: `full_name,email,phone,joined_on`.
- Dry-run mode prints counts and rejects before writing.
- Lowercase and trim emails; skip duplicates by `LOWER(email)`; report them.
- `joined_on` optional (defaults to today).
- Dues status is **not** guessed: create memberships only for rows the club confirms as paid, for a named semester and membership type that already exist, with the dues amount and a `cash` payment dated as recorded. Create the semesters and types first (add `semester` and `type` columns to the CSV).

### 3.2 Notebook budget → ledger
Pick one at go-live and record it in `15_DECISIONS.md`:
- **Fresh start:** begin the ledger on the first day of the semester; keep the notebook as an archive.
- **Backfill:** enter past income as `payments` and past reimbursements as `expenses` (`reimbursed`), with their real dates. Unknown-category income cannot be represented; use the nearest category and note it.

### 3.3 WhatsApp announcements
Not imported. Future announcements live in `announcements`.

## 4. Seed and test data
- `backend/tests/factories.py` creates members, memberships, events, ticket types, products, fundraisers.
- A `make seed-dev` script loads a demo club: 30 fake members, one event with 100 seats, one hoodie with sizes S–XXL, one fundraiser with five tasks, a few payments and expenses.
- Seed and fixtures contain **fake data only**, with `@example.com` emails.

## 5. Personal data inventory
| Field | Table | Why needed | Visible to |
|---|---|---|---|
| Full name | `members`, `tickets.holder_name` | Identify members and ticket holders | Officers; the person |
| Email | `members`, `tickets.holder_email` | Login, mailing list, tickets | Officers; the person |
| Phone | `members` | Contact (optional) | Officers; the person |
| Receipt files | storage | Prove expenses | Treasurer, submitter |

No card numbers, bank details, government IDs, or passwords are stored.

## 6. Retention
| Data | Keep | Then |
|---|---|---|
| Financial records | At least 7 years (confirm with the college) | Archive |
| Member profile | While a member, then 2 years after last membership | Delete or anonymise on request |
| Expired unpaid reservations | 15 minutes | Deleted automatically |
| Redis report copies | 30 to 60 seconds | Expire, or are deleted when a payment is confirmed or a ticket is checked in |
| Redis sign-in links | 15 minutes, or until used | Expire or are deleted on first use |
| Redis rate-limit counters | 1 minute | Expire |
| Redis email queue (holds recipient email addresses) | Until sent; a failed email is retried up to 3 times, then logged | Removed when sent |
| Logs | 30 days | Rotated |

## 7. Data quality rules
- Email format validated and lowercased on write.
- Phone optional; E.164 when present.
- Amounts positive with two decimals.
- Dates in the future only where meaningful (events, due dates).
