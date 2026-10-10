# 14 — Microtasks

Small, ordered, individually shippable. **One microtask = one pull request** (target: under half a day each). Do them in order within a group; groups can overlap where "Depends" allows. Requirement IDs come from `01_PRD.md`.

Status legend: ☐ todo · ◐ in progress · ☑ done. Update this file in the PR that completes the task.

## Group F — Foundation
| ID | Task | Depends | Done when |
|---|---|---|---|
| F-01 ☐ | Create repo layout (`database/ backend/ web/ docs/ .github/`), `.gitignore`, `.env.example`, copy docs and `schema.sql` | — | Repo pushed; docs render on GitHub |
| F-02 ☐ | `docker-compose.yml` with Postgres 16 and Redis 7; `make db-up`, `make db-reset` | F-01 | Local DB starts and loads schema; `redis-cli ping` answers |
| F-03 ☐ | Backend scaffold (FastAPI, settings from env, `/health`, `/ready`) | F-01 | `GET /health` returns 200 |
| F-04 ☐ | SQLAlchemy models mirroring `schema.sql` + Alembic with `0001_baseline` running the SQL file | F-02, F-03 | `alembic upgrade head` from empty DB matches `schema.sql` |
| F-05 ☐ | Core: error classes, handler producing the standard error shape, `request_id` middleware, JSON logging | F-03 | Every error has `code`, `message`, `request_id` |
| F-06 ☐ | Money and time helpers (`Decimal`, string serialisation, UTC) | F-03 | Unit tests; JSON money is `"0.00"` format |
| F-07 ☐ | Test harness: real Postgres, per-test rollback, factories for all tables | F-04 | Sample test passes in CI |
| F-08 ☐ | Web scaffold (React + Vite, TypeScript strict, React Router, API client with error mapping and cookies sent, Vite dev proxy to the API, Vitest) | F-01 | `npm run dev` shows the home page; `npm run build` passes |
| F-09 ☐ | Lint and format config (ruff, mypy, eslint, prettier) and pre-commit | F-03, F-08 | Hooks run locally |
| F-10 ☐ | Sentry in API and web | F-03, F-08 | Test error appears in Sentry |
| F-11 ☐ | Redis client and helpers for the four jobs (`oddo:v1:` prefix; `cache:`, `rate:`, `signin:` keys and the `queue:emails` list; TTL required on every key except the queue; errors logged once and swallowed); `redis` status in `/ready` | F-02, F-03 | Stopping Redis keeps `/ready` at 200 with `redis: "down"`; a key without a TTL cannot be written |

## Group CI — Pipelines
| ID | Task | Depends | Done when |
|---|---|---|---|
| CI-01 ☐ | Add `ci.yml` from `github-workflows/` | F-03, F-08 | Three jobs pass on a PR |
| CI-02 ☐ | Branch protection on `main` with required checks | CI-01 | Direct push blocked |
| CI-03 ☐ | `security.yml`: CodeQL, dependency review, gitleaks, pip-audit, npm audit | CI-01 | Runs on PR and weekly |
| CI-04 ☐ | Dependabot config | F-01 | First update PRs appear |
| CI-05 ☐ | `deploy-staging.yml` (after `D-013`) | CI-01, D-013 | Merge to `main` deploys staging |
| CI-06 ☐ | `deploy-production.yml` with approval gate | CI-05 | Tag deploys after approval |
| CI-07 ☐ | Playwright and k6 jobs against staging | E-01, T-09 | Run after staging deploy |
| CI-08 ☐ | `mobile.yml` (Phase 2) | X-01 | Type-check and lint on `mobile/` PRs |

## Group DB — Schema follow-ups
| ID | Task | Depends | Done when |
|---|---|---|---|
| DB-01 ☐ | Decide `D-020` and `D-021`; if accepted, migration `0002` adds `payments.external_ref` (unique) | F-04 | Migration with downgrade; tests |
| DB-02 ☐ | Migration `0003`: `event_summary` counts only valid tickets (the renewal view already requires `payment_id` in the semester schema) | F-04 | View tests pass (reservation excluded; unpaid membership excluded) |
| DB-04 ☐ | Keep `0001_baseline` equal to the semester version of `schema.sql` (17 tables, 7 views); add the schema tests for semesters, non-member seats and non-member goodie limit | F-04 | Tests in `12_TESTING.md` §3 Database pass |
| DB-03 ☐ | Least-privilege roles: `app` and `migrator` | F-04 | App role cannot run DDL |

## Group A — Auth and roles
| ID | Task | Depends | Done when |
|---|---|---|---|
| A-01 ☐ | `POST /auth/magic-link {email, portal}`: signed 15-min token stored in Redis as `signin:{token}` (hash), sign-in email put on `queue:emails`, always `202`, `503` if Redis is down | F-05, F-11 | Unknown email also `202`; `portal` never changes access |
| A-02 ☐ | `POST /auth/token`: atomic one-time exchange (`GETDEL`) for a 24 h session with a session id; cookie for web, bearer for mobile | A-01 | Expired, used and tampered tokens ⇒ `UNAUTHENTICATED` with the reason |
| A-03 ☐ | Auth dependency + `require_role` with nested roles (Treasurer ⊃ Officer ⊃ Member), roles read from `leadership_roles` for the current year on every request | A-02, F-07 | Role change takes effect on the next request |
| A-04 ☐ | `GET /me` | A-03 | Returns member, every role held, membership status |
| A-05 ☐ | Authorization matrix test over all endpoints | A-03 | Matches `09_SECURITY.md` §3 |
| A-06 ☐ | `POST /auth/logout` clears the session cookie (sessions are stateless; no signed-out list) | A-02 | Cookie cleared; the old token works until its 24 h expiry |
| A-07 ☐ | Rate limiter: Redis counters `rate:{endpoint}:{ip}` (1 min) on sign-in email links, ticket purchase and shop orders; the other limits in `06_API_CONTRACT.md` §6 are not kept in Redis | F-11 | `429` with `Retry-After`; Redis down ⇒ skipped and logged |

## Group C — Redis speed layer (`D-028`)
| ID | Task | Depends | Done when |
|---|---|---|---|
| C-01 ☐ | Read-through cache `cache:{report_name}` (30 to 60 s) for `ticket_availability`, `active_members`, `club_balance` and `fundraiser_progress`; the four keys are deleted after the commit when a payment is confirmed or a ticket is checked in | F-11, T-03, V-04, R-04, P-03, T-07 | Next read after a payment or check-in shows the new numbers; the cache is never read inside a purchase, order or check-in |
| C-02 ☐ | Email queue: `queue:emails` and the `send_emails` worker (up to 3 attempts at 1, 5 and 30 min, then `email_failed`); renewal reminders, announcement emails, ticket QR emails and sign-in link emails use it; `renewal_reminder_sent_at` set only after sending | F-11, A-01 | A failing email is tried 3 times then logged; the API replies without waiting for the send; Redis down ⇒ ticket and announcement emails sent directly once |
| C-03 ☐ | Redis outage test: stop Redis in the test run, and an empty-Redis test (`FLUSHALL`) | C-01, C-02, A-07 | Reports, purchase, orders, webhook and door check-in pass; seat and limit rules hold; only new sign-in links answer `503` |
| C-04 ☐ | Run the race tests (T-09, S-06) with the cache on, and check that no seat hold is ever written to Redis | C-01, T-09, S-06 | Same exact counts as with the cache off |

## Group M — Members and memberships (MEM)
| ID | Task | Depends | Done when |
|---|---|---|---|
| M-01 ☐ | `POST /members` (self sign-up, rate-limited), `GET`, `PATCH`, search | A-03 | MEM-1, `DUPLICATE_EMAIL` |
| M-02 ☐ | `GET /members/lookup` with active status | M-01 | MEM-4 under 300 ms |
| M-03 ☐ | `POST /memberships` (semester and type; dues copied from the type), `GET /members/{id}/memberships` | M-01, M-09 | One per member per semester (`MEMBERSHIP_EXISTS`); dues snapshot test |
| M-04 ☐ | Cash payment service: insert `payments` and link target in one transaction | P-04 | MEM-2 cash path |
| M-05 ☐ | Online dues payment endpoint | P-02, P-03 | MEM-2 online path |
| M-06 ☐ | `GET /memberships/expiring` and `renewal_reminders` job | M-03, DB-02 | MEM-3 sends once |
| M-07 ☐ | Leadership endpoints | A-03 | MEM-6 |
| M-08 ☐ | One-time members CSV import script with dry run | M-01 | Duplicates reported, none inserted twice |
| M-09 ☐ | Semesters and membership types: `GET`, `POST`, `PATCH` (`D-024`) | A-03 | MEM-7; overlap ⇒ `SEMESTER_OVERLAP`; retired type cannot be bought |
| M-10 ☐ | `active_members` semantics in `/me` and `/members/lookup`: semester, type, "starts later" | M-03 | MEM-4 shows semester, type, end date |

## Group P — Payments
| ID | Task | Depends | Done when |
|---|---|---|---|
| P-01 ☐ | Gateway client wrapper with a fake for tests (after `D-009`) | F-03, D-009 | Create order, verify signature |
| P-02 ☐ | Create gateway order for a computed total with target metadata | P-01 | Amount equals server total |
| P-03 ☐ | `POST /webhooks/payment`: signature check, idempotent, links targets | P-02, DB-01 | Duplicate delivery is a no-op |
| P-04 ☐ | Cash payment service for officers | F-07 | Rejects wrong category or amount |
| P-05 ☐ | Late-payment detection, log and alert | P-03 | Event emitted in test |
| P-06 ☐ | Idempotency-Key middleware for purchase endpoints (where results are stored is open, `D-028`; not Redis) | F-05 | Same key replays result; changed body ⇒ conflict |
| P-07 ☐ | Late ticket payment: webhook after the hold was released locks the ticket type and re-checks the seat; still free ⇒ ticket marked paid; gone ⇒ gateway refund, buyer emailed, `late_payment` logged; refund failure alerts | P-05, T-04 | Both outcomes tested; the release job never touches a paid ticket |

## Group T — Events and tickets (TIX)
| ID | Task | Depends | Done when |
|---|---|---|---|
| T-01 ☐ | Events CRUD | A-03 | TIX-1 |
| T-02 ☐ | Ticket types CRUD with `non_member_seat_limit` (0 to `seat_limit`); block lowering either limit below what is sold | T-01 | TIX-1 |
| T-03 ☐ | Availability on event endpoints: seats left and non-member seats left | T-02 | TIX-4 |
| T-04 ☐ | Purchase for members and non-members: lazy cleanup, lock, per-holder price, check total and non-member seats (all or nothing), reserve, create gateway order, free-ticket path | T-02, P-02, P-06 | TIX-2, TIX-3; `SOLD_OUT` and `SOLD_OUT_NON_MEMBER` |
| T-05 ☐ | Payment confirmation validates tickets and sends ticket email | P-03, T-04 | Ticket valid after webhook |
| T-06 ☐ | `GET /tickets/{code}` and `GET /me/tickets` | T-05 | TIX-5 |
| T-07 ☐ | `POST /checkin` atomic, with exact failure reasons | T-05 | TIX-6; all five outcomes tested |
| T-08 ☐ | Event summary and attendee list | DB-02, T-07 | TIX-7 |
| T-09 ☐ | **Race test:** 200 concurrent buyers, 100 seats; non-member race (50 buyers, 10 non-member seats); double-scan race | T-04, T-07 | Exactly 100 sold; exactly 10 non-member; exactly one admit |
| T-10 ☐ | `expire_reservations` job: deletes expired unpaid ticket rows and cancels expired orders; never touches a paid ticket | T-04 | Frees seats; correctness holds without job |

## Group N — Announcements (ANN)
| ID | Task | Depends | Done when |
|---|---|---|---|
| N-01 ☐ | `POST`, `GET` list and detail | A-03 | ANN-1, ANN-3 |
| N-02 ☐ | Announcement emails put on `queue:emails`, one per member, sent by the worker with retries (C-02) | N-01, C-02 | ANN-2; post succeeds even if email fails |

## Group S — Shop (MER)
| ID | Task | Depends | Done when |
|---|---|---|---|
| S-01 ☐ | Products and variants CRUD, stock editing, `non_member_limit` | A-03 | MER-1 |
| S-02 ☐ | `POST /orders` for members and non-members: price rule, non-member quota check (first come first served, shared across sizes), atomic stock decrement, reserve | S-01, P-06 | MER-2, MER-4, MER-6; `NON_MEMBER_LIMIT_REACHED` |
| S-03 ☐ | Order payment and webhook linking, status `paid` | S-02, P-03 | MER-3 |
| S-04 ☐ | Cancel and expiry restore stock | S-02 | Stock returns exactly once |
| S-05 ☐ | Orders list and filters for officers | S-03 | MER-5 |
| S-06 ☐ | **Race test:** concurrent orders on low stock; 20 concurrent non-member orders against a limit of 5 | S-02 | Never below zero; exactly 5 non-member units |
| S-07 ☐ | Non-member units taken and left on `GET /products` and in the shop manager | S-02 | MER-5; numbers match the trigger's count |

## Group R — Fundraisers (FUN)
| ID | Task | Depends | Done when |
|---|---|---|---|
| R-01 ☐ | Fundraisers CRUD | A-03 | FUN-1 |
| R-02 ☐ | Tasks CRUD, assignment | R-01 | FUN-2 |
| R-03 ☐ | Assignee can change status only; officers anything | R-02 | Permission tests |
| R-04 ☐ | Progress endpoint (tasks, raised vs goal) | R-02, R-05 | FUN-3 |
| R-05 ☐ | Record fundraiser income | P-04 | FUN-4 |

## Group V — Expenses and treasurer (TRS)
| ID | Task | Depends | Done when |
|---|---|---|---|
| V-01 ☐ | Receipt signed-upload URL (after `D-012`) | D-012 | Type and size limits enforced |
| V-02 ☐ | Submit and list expenses | A-03, V-01 | TRS-2 |
| V-03 ☐ | Approve, reject, reimburse with state machine, no self-approval | V-02 | TRS-3 |
| V-04 ☐ | `GET /treasurer/summary` | F-04 | TRS-1, TRS-4 equals hand-computed totals |
| V-05 ☐ | `GET /treasurer/ledger` | V-04 | Filters work; totals reconcile |
| V-06 ☐ | `GET /treasurer/outstanding` | M-03, S-02, V-03 | TRS-5 |

## Group W — Web
| ID | Task | Depends | Done when |
|---|---|---|---|
| W-01 ☐ | Design tokens, layout, navigation by role, error and empty components | F-08 | `07_UI_SPECS.md` §2–3, §6 |
| W-02 ☐ | Three login pages (`/login`, `/officer/login`, `/treasurer/login`), "check your email", `/auth/callback`, member sign-up (member page only), sign out | A-02, A-06 | Magic link flow works on all three pages; used and expired links show the right message |
| W-03 ☐ | Home, events list, event detail | T-03 | |
| W-04 ☐ | Ticket purchase and payment status | T-04, T-05 | Handles sold out, expired hold |
| W-05 ☐ | My tickets with QR | T-06 | QR readable, code shown as text |
| W-06 ☐ | Announcements list and detail | N-01 | |
| W-07 ☐ | Shop, cart, checkout | S-02, S-03 | Sold-out sizes disabled |
| W-08 ☐ | My membership, my orders, my expenses, my tasks | M-03, S-05, V-02, R-03 | |
| W-09 ☐ | Officer: members, verify member, record cash dues | M-02, M-04 | |
| W-10 ☐ | Officer: event manager and summary | T-08 | |
| W-11 ☐ | **Door check-in** screen | T-07 | Full-screen result states; manual entry fallback |
| W-12 ☐ | Officer: announcement composer | N-01 | Confirmation shows recipient count |
| W-13 ☐ | Officer: shop manager and orders | S-05 | |
| W-14 ☐ | Officer: fundraiser board | R-04 | |
| W-15 ☐ | Expense queue and **treasurer dashboard**, outstanding | V-03, V-04, V-06 | |
| W-16 ☐ | Accessibility pass and axe checks | W-03…W-18 | No serious violations |
| W-17 ☐ | Join or renew screen (semester, then type with dues) and "Starts on" state in My membership | M-03, M-09 | Matches `07_UI_SPECS.md` |
| W-18 ☐ | Officer: semesters and membership types manager; non-member seat limit in the event manager; non-member limit in the shop manager | M-09, T-02, S-01 | Overlap and limit errors shown inline |
| W-19 ☐ | Role route guards (`RequireRole`), "No access" page, return to the same page after sign-in, menus by role | W-02, A-04 | Member on `/officer/*` sees "No access"; signed out goes to the right login page; the API still answers `403` if the guard is bypassed |

## Group E — End-to-end tests (one per scene)
| ID | Task | Depends |
|---|---|---|
| E-01 ☐ | New student joins for a semester and is verified | W-02, W-09 |
| E-07 ☐ | Semester renewal: reminder, early purchase, becomes active on day one | W-17, M-06 |
| E-08 ☐ | Non-members: gala seats and hoodies run out for non-members while members can still buy | W-04, W-07 |
| E-09 ☐ | Role-based login: member, officer and treasurer each sign in on their own page and see only their area; wrong page shows "No access"; sign out | W-19 |
| E-02 ☐ | Spring gala: buy, pay (test mode), check in, double scan, summary | W-04, W-11 |
| E-03 ☐ | Announcement reaches site and emails | W-12 |
| E-04 ☐ | Hoodie order and stock change | W-07 |
| E-05 ☐ | Fundraiser tasks and progress | W-14 |
| E-06 ☐ | Expense to reimbursement to balance | W-15 |

## Group X — Mobile and AdMob (Phase 2)
| ID | Task | Depends | Done when |
|---|---|---|---|
| X-01 ☐ | Expo scaffold with EAS dev build profiles | Phase 1 done | App runs on a device |
| X-02 ☐ | Auth with secure storage | A-02 | |
| X-03 ☐ | Events, purchase, my tickets (offline-viewable QR) | T-04, T-06 | |
| X-04 ☐ | Officer check-in scanner | T-07 | Same states as web |
| X-05 ☐ | Shop and announcements | S-02, N-01 | |
| X-06 ☐ | `GET /config` kill switch endpoint | F-03 | Returns `ads_enabled` |
| X-07 ☐ | AdMob SDK, config plugin, **test IDs only** | X-01 | Test banner shows in dev build |
| X-08 ☐ | `<AdBanner>` wrapper and placement on three list screens only | X-07 | No ads on forbidden screens (test) |
| X-09 ☐ | UMP consent flow; SDK init after consent | X-07 | Ads wait for consent |
| X-10 ☐ | Kill switch wired to app | X-06, X-08 | `ads_enabled=false` ⇒ no requests |
| X-11 ☐ | `app-ads.txt` on developer site; AdMob verification | D-015 | Verified in console |
| X-12 ☐ | Production EAS profile with real IDs; store listings and privacy forms | X-08…X-11 | `10_ADMOB.md` §10 ticked |

## Group L — Launch
| ID | Task | Depends |
|---|---|---|
| L-01 ☐ | Provision production: DB, backups, secrets, domains, TLS | D-013 |
| L-02 ☐ | Restore drill from backup | L-01 |
| L-03 ☐ | Gateway live setup, ₹1 live payment and refund | P-03 |
| L-04 ☐ | Email domain SPF, DKIM, DMARC | N-02 |
| L-05 ☐ | Import members; ledger start decision | M-08 |
| L-06 ☐ | Load test and fix findings | T-09, S-06 |
| L-07 ☐ | Officer training and door drill | W-11 |
| L-08 ☐ | Work through `13_PRODUCTION_CHECKLIST.md`; tag `v1.0.0` | all above |

## How to add a microtask
Append a row in the right group with: ID, one-sentence task, dependencies, and an objective "Done when". If it needs a new table, endpoint, or vendor, add a `Proposed` entry in `15_DECISIONS.md` first.
