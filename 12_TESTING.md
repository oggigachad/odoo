# 12 — Testing

## 1. Strategy
Test the rules that lose money or trust first: seats, stock, prices, payments, check-in, balances, permissions. Use **real PostgreSQL** in tests (never SQLite), because the trigger, constraints, and views are part of the behaviour.

| Level | Tool | What |
|---|---|---|
| Schema / DB | pytest + psycopg | Constraints, trigger, views |
| Unit | pytest | Pure rules: price selection, active membership, state machines |
| Integration / API | pytest + httpx (ASGI) | Endpoints against a real database, transaction rollback per test |
| Contract | Schemathesis or OpenAPI diff | API matches `06_API_CONTRACT.md` |
| Web unit | Vitest / Jest + Testing Library | Components, forms, error mapping |
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
- `active_members` boundary dates (first and last valid day inclusive, day after excluded; unpaid excluded).
- `memberships_due_for_renewal` window and "reminder already sent".
- `treasurer_summary` and `club_balance` equal hand-computed totals.

### Business rules (unit / integration)
| ID | Case |
|---|---|
| MEM-5 | Active member email gets member price; expired and unpaid get non-member price |
| TIX-2 | Mixed party (1 member, 1 non-member) is priced per holder |
| TIX-3 | **Race:** 200 concurrent purchases for 100 seats ⇒ exactly 100 tickets, the rest `SOLD_OUT` |
| TIX-6 | Check-in: admitted once; second scan `ALREADY_CHECKED_IN`; unpaid; wrong event; not found; **race:** two simultaneous scans ⇒ one admitted |
| TIX-3, MER-4 | Reservation expiry frees seats; lazy cleanup works without the job |
| MER-4 | **Race:** concurrent orders never push stock below zero; cancel and expiry restore stock |
| PAY | Webhook with bad signature rejected; duplicate webhook is a no-op; late payment logged and alerted; amount matches total |
| TRS-3 | Expense transitions only via allowed paths; self-approval blocked; `reimbursed_at` set |
| TRS-1/4 | Balance equals in − out after a mixed set of payments and expenses |
| TRS-5 | Outstanding lists only unpaid dues, `placed` orders, approved-unreimbursed expenses |
| ANN-2 | Posting queues one email per member; email failure does not fail the post |
| MEM-3 | Reminder job sends once and records the time |

### Authorization matrix
A parametrised test hits every endpoint as Public, Member, Officer, Treasurer and asserts the allowed or denied result from the table in `09_SECURITY.md`. A member cannot read another member's tickets, orders, or expenses.

### API behaviour
- Money always serialised as strings with two decimals.
- Error body always has `code`, `message`, `request_id`.
- Pagination limits enforced (`limit` ≤ 100).
- Idempotency: same key returns the same result; changed body ⇒ `IDEMPOTENCY_CONFLICT`.
- Rate limits return `429` with `Retry-After`.

## 4. End-to-end scenarios (one per scene)
| Scene | Playwright flow |
|---|---|
| New student joins | Sign up → officer records cash dues → verify member shows Active with expiry |
| Spring gala | Browse → buy 2 tickets (one member, one not) → pay in gateway test mode → ticket QR shown → officer checks in → second scan shows "already used" → event summary shows sold 2, attended 1 |
| Announcement | Officer posts → appears on site → email provider mock received one message per member |
| Hoodies | Member picks size → pays → stock down by one → sold-out size disabled |
| Fundraiser | Officer creates fundraiser and 3 tasks → assignee marks done → progress shows 1/3 |
| Treasurer | Volunteer submits expense with receipt → treasurer approves and reimburses → dashboard balance drops; outstanding list updates |

## 5. Test data and environment
- Factories for every table; fake data only (`@example.com`).
- Payment gateway, email, and storage are replaced by fakes in tests; a small number of staging tests use the gateway's **test mode**.
- Each test runs in a rolled-back transaction, except concurrency tests, which use committed data and clean up.
- Freeze time with a clock helper for expiry and boundary tests.

## 6. Load test (before launch)
k6 script ramps to 200 concurrent buyers against a 100-seat event and 100 buyers against 30 hoodies in one size. Pass: no oversell, p95 purchase < 1 s, no 5xx.

## 7. Mobile and AdMob (Phase 2)
Manual pass on one low-end Android and one iPhone: sign-in, ticket QR readable at max brightness, check-in scan in low light, offline ticket view, ad placement rules from `10_ADMOB.md` §8.

## 8. CI integration
Backend and web tests run in `ci.yml` on every pull request. Playwright and k6 run on staging after deploy and before each production release.

## 9. Bug policy
Every bug fix includes a regression test that fails before the fix.
