# 12 — Testing

## 1. Strategy
Test the rules that lose money or trust first: seats, stock, prices, payments, check-in, balances, permissions. Use **real PostgreSQL** in tests (never SQLite), because the trigger, constraints, and views are part of the behaviour, and a **real Redis** (never a mock) for cache, sign-in and rate-limit tests, because TTLs and atomic `GETDEL` are part of the behaviour.

| Level | Tool | What |
|---|---|---|
| Schema / DB | pytest + psycopg | Constraints, trigger, views |
| Unit | pytest | Pure rules: price selection, active membership, state machines |
| Integration / API | pytest + httpx (ASGI) | Endpoints against a real database, transaction rollback per test |
| Contract | Schemathesis or OpenAPI diff | API matches `06_API_CONTRACT.md` |
| Cache / Redis | pytest with a real Redis | Keys, TTLs, invalidation, single-use links, outage behaviour |
| Web unit | Vitest + Testing Library | Components, forms, error mapping, route guards by role |
| End-to-end | Playwright | One flow per brief scene |
| Mobile | Jest + RN Testing Library; manual device pass | Screens, ad placement rules |
| Load | k6 | Concurrency on tickets and stock |
| Accessibility | axe in Playwright | No serious violations on key pages |
| Security | pytest authorization matrix; `pip-audit`, `npm audit`, CodeQL | Roles, dependencies |

## 2. Coverage gates
- Backend ≥ 80% lines overall; services touching money, seats, stock, or check-in ≥ 95%.
- Every requirement ID in `01_PRD.md` has at least one test whose name or docstring contains the ID (for example `test_TIX_3_no_oversell_under_concurrency`).

## 3. Must-have test cases
### Database
- Case-insensitive duplicate email rejected.
- Negative price, stock, or amount rejected.
- Payment with category `fundraiser` needs `fundraiser_id`, and others must not have it.
- Expense `reimbursed_at` required iff `reimbursed`.
- Seat trigger blocks the (limit + 1)th ticket.
- Seat trigger blocks the (non-member limit + 1)th non-member ticket (`member_id` NULL) while members can still take the remaining seats.
- `non_member_seat_limit` above `seat_limit` or below zero rejected.
- Overlapping semesters rejected; duplicate semester name rejected; `ends_on` before `starts_on` rejected.
- Duplicate membership type name (any case) rejected; a second membership for the same member and semester rejected.
- Goodie trigger blocks a non-member order line that would pass `non_member_limit`, counting all sizes of the product together; a cancelled order gives its units back; a product with limit 0 refuses non-members; members are not limited by it.
- A non-member order without a buyer name or email rejected.
- `active_members` boundary dates (first and last day of the semester inclusive, day after excluded; unpaid excluded; a paid next-semester membership is not active before its start).
- `memberships_due_for_renewal` window, "reminder already sent", unpaid excluded, and a member who already paid for the next semester excluded.
- `treasurer_summary` and `club_balance` equal hand-computed totals.

### Business rules (unit / integration)
| ID | Case |
|---|---|
| MEM-2 | Dues are copied from the type at purchase; changing the type's dues later leaves old memberships unchanged |
| MEM-5 | Active member email gets member price for every membership type; expired, unpaid and not-yet-started get non-member price |
| MEM-7 | Officers can add, edit and retire (`is_offered` off) types; retired types cannot be bought but old memberships keep working |
| TIX-2 | Mixed party (1 member, 1 non-member) is priced per holder |
| TIX-3 | **Race:** 200 concurrent purchases for 100 seats ⇒ exactly 100 tickets, the rest `SOLD_OUT` |
| TIX-3 | **Race:** 50 concurrent non-member purchases for 10 non-member seats ⇒ exactly 10, the rest `SOLD_OUT_NON_MEMBER`, while members can still buy until the total is reached |
| TIX-3 | A purchase with one member and one non-member holder fails as a whole when the non-member seats are gone |
| MER-6 | **Race:** 20 concurrent non-member orders of 1 unit against a non-member limit of 5 ⇒ exactly 5 units, the rest `NON_MEMBER_LIMIT_REACHED` |
| MER-6 | First come first served: with 3 units left, the earlier order of 3 succeeds and the later order of 1 is refused; if the earlier order expires unpaid, the later buyer can then succeed |
| MER-6 | Quota is shared across sizes; a limit of 0 refuses non-members; member orders ignore the limit and use only stock |
| TIX-6 | Check-in: admitted once; second scan `ALREADY_CHECKED_IN`; unpaid; wrong event; not found; **race:** two simultaneous scans ⇒ one admitted |
| TIX-3, MER-4 | Reservation expiry frees seats; lazy cleanup works without the job |
| MER-4 | **Race:** concurrent orders never push stock below zero; cancel and expiry restore stock |
| PAY | Webhook with bad signature rejected; duplicate webhook is a no-op; amount matches total; late order payment logged and alerted |
| PAY-LATE | Ticket payment confirmed after the hold was released: if the seat is still free the ticket is marked paid; if another buyer took it the buyer is refunded and emailed, `late_payment` is logged; a failed refund call raises an alert; the release job never deletes a paid ticket |
| TRS-3 | Expense transitions only via allowed paths; self-approval blocked; `reimbursed_at` set |
| TRS-1/4 | Balance equals in − out after a mixed set of payments and expenses |
| TRS-5 | Outstanding lists only unpaid dues, `placed` orders, approved-unreimbursed expenses |
| ANN-2 | Posting queues one email per member on `queue:emails`; email failure does not fail the post; a failed send is retried up to 3 times, then `email_failed` is logged |
| MEM-3 | Reminder job queues once; `renewal_reminder_sent_at` is set only after the email is sent |

### Authorization matrix
A parametrised test hits every endpoint as Public, Member, Officer, Treasurer and asserts the allowed or denied result from the table in `09_SECURITY.md`. A member cannot read another member's tickets, orders, or expenses.

### Login pages and role-based access (`D-029`)
| Case |
|---|
| A member-only account that signs in on `/officer/login` or `/treasurer/login` is signed in as a member, sees "No access" for the area, and can open My stuff |
| An officer who signs in on `/login` lands in My stuff and can open Manage; an officer cannot open `/treasurer/*` and the treasurer endpoints answer `403` |
| The treasurer can open every officer screen and the dashboard |
| Forging `portal=treasurer` in a link for a plain member changes only the landing page; treasurer endpoints still answer `403` |
| Deleting a person's `leadership_roles` row removes officer access on their next request without signing them out |
| Route guards (Vitest): signed out on `/officer/orders` goes to `/officer/login` and returns to `/officer/orders` after sign-in; signed in without the role shows "No access" |
| A hidden screen is not protection: calling an officer endpoint directly as a member answers `403` |
| Sign-in link works once: second use ⇒ `UNAUTHENTICATED` with reason `used`; an old link ⇒ reason `expired`; a changed token ⇒ reason `invalid` |
| After `POST /auth/logout` the cookie is cleared; the old token still works until its 24 h expiry (sessions are stateless) |
| Officer and treasurer login pages show no sign-up link; `POST /members` still creates only members |

### Redis, the speed layer (`D-028`)
| Case |
|---|
| A second read of `ticket_availability` is served from `cache:ticket_availability`; a confirmed payment or a ticket check-in deletes the four `cache:` keys and the next read shows the new numbers |
| No seat hold is ever written to Redis: after a purchase, a scan of `oddo:v1:*` finds no key for the held seat, and the hold is an unpaid `tickets` row |
| Every key written under `oddo:v1:` has a TTL (scan and assert) |
| With a deliberately stale `seats_left` in the cache, a purchase still answers correctly (`SOLD_OUT`, `SOLD_OUT_NON_MEMBER`); the race tests in §3 pass with the cache turned on |
| With Redis stopped: reports (read from PostgreSQL), purchase, orders, webhook and door check-in still pass; `/ready` is `200` with `redis: "down"`; `POST /auth/magic-link` answers `503`; rate limits are skipped; ticket and announcement emails are sent directly |
| The 6th `POST /auth/magic-link` from one IP within a minute answers `429` with `Retry-After`; the purchase and order endpoints limit at 10 per minute per IP; other endpoints are not limited by Redis |
| `FLUSHALL` between two requests changes nothing except speed (and invalidates unused links and queued emails) |
| Club balance read from the cache equals the database after a payment and an expense, within the 60 s TTL and exactly after the invalidation |
| `queue:emails`: a failing email is tried 3 times then logged as `email_failed`; a queued ticket QR email is sent once; emails enqueued before a worker restart are still sent |

### API behaviour
- Money always serialised as strings with two decimals.
- Error body always has `code`, `message`, `request_id`.
- Pagination limits enforced (`limit` ≤ 100).
- Idempotency: same key returns the same result; changed body ⇒ `IDEMPOTENCY_CONFLICT` (where results are stored is open, `D-028`).
- Rate limits return `429` with `Retry-After`.

## 4. End-to-end scenarios (one per scene)
| Scene | Playwright flow |
|---|---|
| New student joins | Sign up → officer records cash dues for a semester and type → verify member shows Active with semester, type and expiry |
| Semester renewal | Member with a semester ending in 30 days gets one reminder → buys the next semester → shows "Starts on {date}" → becomes Active when the semester begins |
| Spring gala | Browse → buy 2 tickets (one member, one not) → pay in gateway test mode → ticket QR shown → officer checks in → second scan shows "already used" → event summary shows sold 2, attended 1 |
| Spring gala, non-members | Non-member buys until the non-member seats are gone → next non-member sees "Sold out for non-members" → a member can still buy |
| Announcement | Officer posts → appears on site → email provider mock received one message per member |
| Hoodies | Member picks size → pays → stock down by one → sold-out size disabled |
| Hoodies, non-members | Non-member gives name and email → pays → non-member units left drop by the quantity → when the limit is used up the shop shows "Sold out for non-members" while members can still order |
| Fundraiser | Officer creates fundraiser and 3 tasks → assignee marks done → progress shows 1/3 |
| Role-based login | Member, officer and treasurer accounts each sign in on their own page and see only their area; a member on the officer page sees "No access"; sign out ends the session; with Redis stopped, an existing session still works, buying and door check-in still work, and a new link request shows the friendly message |
| Treasurer | Volunteer submits expense with receipt → treasurer approves and reimburses → dashboard balance drops; outstanding list updates |

## 5. Test data and environment
- Factories for every table; fake data only (`@example.com`).
- Payment gateway, email, and storage are replaced by fakes in tests; a small number of staging tests use the gateway's **test mode**.
- Each test runs in a rolled-back transaction, except concurrency tests, which use committed data and clean up.
- Freeze time with a clock helper for expiry and boundary tests.

## 6. Load test (before launch)
Run it once with Redis up and once with Redis stopped; the results must match. k6 script ramps to 200 concurrent buyers against a 100-seat event (with 30 non-member seats) and 100 buyers against 30 hoodies in one size (with a non-member limit of 10). Pass: no oversell, never more than 30 non-member tickets or 10 non-member hoodies, p95 purchase < 1 s, no 5xx.

## 7. Mobile and AdMob (Phase 2)
Manual pass on one low-end Android and one iPhone: sign-in, ticket QR readable at max brightness, check-in scan in low light, offline ticket view, ad placement rules from `10_ADMOB.md` §8.

## 8. CI integration
Backend and web tests run in `ci.yml` on every pull request. Playwright and k6 run on staging after deploy and before each production release.

## 9. Bug policy
Every bug fix includes a regression test that fails before the fix.
