Fix first (the brief asks for these and the spec has none)

Renewal reminders and auto-expiry. The brief says someone should be reminded to renew before it lapses. The spec only has a worker for ticket holds and one for email. Add a daily job that emails members 30 and 7 days before expiry and marks lapsed ones expired. Add a renew endpoint too.
Per-event report. The brief wants attendance versus tickets sold, and how much the event made. There’s no endpoint for it. It also isn’t possible yet, because transactions has no event_id or fundraiser_id. Add both columns, and the same for reimbursements. That one change also gives you fundraiser progress and profit per event.
Online payments. Tickets go from reserved to paid, but nothing in the API does that, and everything else is cash only. Add Razorpay test mode with an idempotent webhook that writes the ledger entry, or at least a “mark paid” action. Make the currency configurable, since the spec uses $.
Admin APIs. Section 6.9 describes user roles, deactivation, audit log and system metrics, but section 8 has no endpoints for them. There’s also no audit_logs table.
Missing tables. Add announcements, email_queue, notifications and audit_logs, and spell out fundraiser_tasks (due date, assignee, estimated cost).
Leadership turnover. The brief says leaders are elected every year. The member role mentions voting but no voting feature exists. Add role terms with start and end dates, bulk role reassignment, and an archive of last year’s team. Alternatively, drop “voting” from the spec.

Missing by scene

Members: a tiers table the admin can edit instead of a fixed annual/semester/lifetime list. Import the existing sign-up spreadsheet from a CSV, since that’s today’s data source. Online dues payment.
Tickets: a /me/tickets list, cancel and refund with a reversing ledger entry, a batch-sync endpoint for the offline check-in queue (the spec mentions it but has no route), and event edit, cancel and unpublish.
Announcements: audience targeting (members only or everyone), per-recipient delivery status, unsubscribe, and edit.
Merch: GET /shop/orders is officer-only, so members can’t see their own orders. Add /me/orders, order cancel with restock, release of unpaid reservations after a timeout, and low-stock alerts.
Fundraisers: task due dates, an overdue highlight, task delete, and fundraiser deadlines.
Treasury: CSV or PDF export, filters by date, event and category, manual entries for sponsorship or bank fees, and a semester close that locks the period. The approver must not be the claimant. A GET for a user’s own reimbursements is missing, as is receipt storage with file type and size limits.

Inconsistencies to fix

The ledger is called double-entry, but the table is single-entry (inflow or outflow). Either rename it or add debit and credit accounts.
The spec says “Treasurer and President” approve claims, and “dual-officer approval”, but there’s no President role and only Treasurer or Admin can approve.
There’s no door-only role. Officers can check in tickets, but so can no one else, so a door volunteer would need full officer rights. Use a scoped check-in role or an event PIN.
Seeding password123 accounts conflicts with your “remove all dummy data” goal. Create only the first admin at setup.
Signup requires @skyline.edu, which clashes with the Gmail autofill you wanted. Make the allowed domain a setting.
JWTs in browser storage are open to XSS. Use httpOnly cookies, and add password reset, email verification, refresh tokens, logout and login lockout.
Real-time covers only four channels. Add tasks, orders, check-in counts, reimbursements and membership status. Resync missed events when a client reconnects.
---

## Brief-gap review (10 Oct 2026)

**Fixed (needed by the problem statement: events, members, money)**
- Renewal reminders and expiry: daily job `jobs/membership_reminders.py` emails paid members 30 and 7 days before the semester ends (skips anyone who already renewed). Expiry needs no flag: membership status is derived from semester dates, so it lapses by itself. `POST /api/v1/memberships/renew` renews into the next semester with the member's last tier.
- Per-event report: `GET /api/v1/events/{id}/report` (sold vs attended, no-shows, attendance rate, revenue, approved expenses, net). Fundraiser profit: `GET /api/v1/fundraisers/{id}/report`. No new columns were needed: `expenses` already has `event_id`/`fundraiser_id`, and tickets/payments already link to events and fundraisers.
- Existing spreadsheet: `POST /api/v1/members/import` (CSV: full_name, email, phone, student_id).
- Online payments "or at least a mark-paid action": the mark-paid action exists (Finance > Awaiting payment > Mark cash received, `POST /payments/cash`).

**Already satisfied by the current system**: `/me/tickets`, `/me/orders`, order cancel with restock, unpaid-hold release, batch sync for offline check-in, own-reimbursement list, receipt type/size limits, approver cannot be the claimant, editable membership tiers (`/membership-types`), real-time resync on reconnect, logout and login lockout.

**Deliberately left out (not needed for the brief, and changing them would alter working features)**: Razorpay integration and multi-currency, audit-log/metrics admin APIs, notifications/email_queue tables, voting and role-term archive, ticket refunds and event edit/cancel, announcement targeting, fundraiser due dates, treasury CSV/PDF export and semester lock, true double-entry accounts (the ledger is single-entry in/out and the doc should say so), door-only role, httpOnly-cookie-only sessions.


---

## Status update (11 Oct 2026)

Everything in the earlier tables stays as recorded. Issues found and closed afterwards:

| # | Issue | Status |
| :--- | :--- | :--- |
| 1 | Sign-up could skip the emailed code (any password-only registration worked) | Fixed: code mandatory, verified server-side |
| 2 | Email blasts to arbitrary addresses through the code endpoint | Fixed: only known sign-in addresses or allowed sign-up domains, 1 per minute, 3 per 15 minutes per address |
| 3 | A cancelled membership payment blocked buying again and the success message could appear for failed payments | Fixed: unpaid membership is reused, "Pay now" added, one outcome per checkout |
| 4 | Verify response reported role "Member" for every payment | Fixed: real role and a message per category |
| 5 | Shop "Buy now" placed an empty order; checkout never opened payment | Fixed |
| 6 | Signed-in admin/officer orders returned HTTP 500 (name and email not recorded) | Fixed, with regression test |
| 7 | Paying for a merchandise order returned HTTP 500 (no stored order total) | Fixed: total is the sum of order lines; paid, cancelled or expired orders cannot be paid |
| 8 | Non-numeric prices caused HTTP 500 | Fixed: 422 with a clear message; inputs accept numbers only |
| 9 | No way to delete events or products | Added with safeguards |
| 10 | Ticket prices could not be edited after creation | Added (price, description) |
| 11 | Popups opened off-screen at the top of long pages (profile, product) | Fixed: rendered over the whole page |
| 12 | Pictures could silently land on local disk; ticket key silently reused the login key | Fixed: MinIO only, separate required key |
| 13 | Panels hid failed requests behind empty lists | Fixed: errors are shown |
| 14 | Sign-in with Google could create accounts | Fixed: existing accounts only |

Verified with 44 passing backend tests, a clean type-check and a browser sweep of every tab for Admin, Member and Guest at desktop and phone widths (no page errors, failed requests, broken images or sideways scrolling).

---

## Security review (11 Oct 2026)

Fixed in code: login codes were echoed in API responses outside production (anyone reaching the API could read the code for any known address; now only to a caller on the same machine in development or test); passwords hash with 600,000 PBKDF2 rounds (older hashes keep working); security headers on every response (nosniff, frame deny, referrer policy, camera permission, HSTS in production); API docs and `openapi.json` switched off in production; the server refuses to start outside development with a weak or default `JWT_SECRET`; PostgreSQL, MinIO and its console listen on 127.0.0.1 only.

Still to do before going live (owner actions): rotate every secret that was pasted in chat (Gmail App Passwords, Google client secret, Razorpay keys, the admin and MinIO passwords) and move them to a secret manager; set `APP_ENV=production` and serve over HTTPS; Redis still publishes port 6379 on all interfaces because binding it to 127.0.0.1 is blocked on this Windows machine (it requires a password; firewall the port or remove the `ports:` entry and let only the API container reach it); receipts under `/uploads/receipts` are served without sign-in (names are random UUIDs, move them to MinIO with signed URLs); tickets are tied to a login cookie with `SameSite=Lax` and bearer tokens kept in browser storage, so keep a strict content-security policy once the site has a domain; add MFA for Admin and an audit log for role changes.

### Redis incident note (11 Oct 2026)
Finding: a native Windows `redis-server` 3.0.504 (an unmaintained 2016 build) was listening on `0.0.0.0:6379` with no password, so the API was using it instead of the Docker Redis and anyone on the network could read or write OTP codes, rate-limit counters, payment order bindings and the email queue. The Docker Redis (7.4, password) could not bind 6379 because of it. Fix: the API now uses the Docker Redis on `127.0.0.1:6380` with its password (`REDIS_URL` in `backend/.env`, tests updated). The native Redis was left running because it may belong to something else: stop it with `Stop-Service Redis` (or uninstall it) once you confirm nothing else needs it, and block inbound 6379 in Windows Firewall.


### Use-case test findings (11 Oct 2026)
| # | Finding | Fix |
| :--- | :--- | :--- |
| 1 | Sign-up codes arrived late or never from a home network (Gmail SMTP filtered at random) | HTTPS e-mail options (Brevo, Resend, Gmail relay), SMTP on both ports with retries, 5 retries per message |
| 2 | Treasurer and Accountant could create events, products, fundraisers and use the door through the API (the screen hid them) | New `RequireOperator`: Admin and officers only for events, ticket types, check-in, manifest, products, sizes, fundraisers |
| 3 | Typing a member's e-mail on a ticket gave the member price to anyone | Member price only for the signed-in buyer's own ticket (blank holder e-mail means the buyer) |
| 4 | Per-person ticket limits could be skipped by leaving the e-mail blank | An e-mail is required on every ticket where a cap exists; blank means the buyer when signed in |
Result of the full test after the fixes: 136 of 136 checks passed, plus 49 automated tests.
