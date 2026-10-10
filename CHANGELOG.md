# Changelog

All notable changes to Oddoskyline. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/). Add entries under **Unreleased** in every pull request.

## [Unreleased]

### Added
- Project documentation set in `docs/`: master rules, PRD, TRD, architecture, data model, data source, API contract, UI specs, error handling, security, AdMob, GitHub Actions, testing, production checklist, microtasks, decisions.
- `.github/workflows/ci.yml` (database, backend, web jobs).
- `README.md` for the hackathon submission: problem, solution, status, architecture, setup, demo walkthrough, docs index.
- Six architecture and data diagrams on the design canvas: system architecture, data model, membership by semester, gala tickets and door check-in, money in and out, and who can do what.
- Semester-wise membership: new `semesters` and `membership_types` tables (`D-024`).
- Non-member seat limit on ticket types so the Spring Gala is open to members and non-members (`D-025`).
- Non-member limit on products, handed out first come, first served, and orders that non-members can place (`D-026`).
- Error codes `SOLD_OUT_NON_MEMBER`, `NON_MEMBER_LIMIT_REACHED`, `SEMESTER_OVERLAP`, `MEMBERSHIP_EXISTS`.
- Redis 7 as a speed layer (`D-027`, `D-028`) with four jobs: 30 to 60 s copies of `ticket_availability`, `active_members`, `club_balance` and `fundraiser_progress`; rate limits on sign-in email links, ticket purchase and shop orders; one-time sign-in links; the `queue:emails` job queue with up to 3 attempts. Seat holds stay in PostgreSQL. Outage behaviour, tests, microtasks (F-11, group C, P-07) and checklist items.
- Late ticket payment: if the gateway confirms after the 15-minute hold was released, the seat is checked again in one locked step; still free ⇒ ticket paid, gone ⇒ buyer refunded and told (`D-008`).
- Role-based login pages for members, officers and the treasurer, with nested roles and route guards (`D-029`); `POST /auth/logout` (clears the cookie); `portal` hint on `POST /auth/magic-link`; microtasks A-06, A-07, W-19, E-09.
- Sign-in, cached-report and queued-email sequence diagrams in `docs/03_ARCHITECTURE.md`.
- "Redis keys (temporary, not tables)" panel on the data model diagram; the table count stays 17.

### Changed
- `database/schema.sql` now has 17 tables (was 15) and still 7 views.
- `memberships` refer to a semester and a type instead of free-form `valid_from` and `valid_until`; one membership per member per semester.
- `ticket_types` gain `non_member_seat_limit`; `enforce_seat_limit` checks it.
- `products` gain `non_member_limit`; `orders.member_id` is optional, with `buyer_name` and `buyer_email` for non-members; new trigger `enforce_non_member_goodie_limit`.
- `active_members`, `memberships_due_for_renewal` and `ticket_availability` rewritten for semesters and the non-member seat counts.
- PRD, TRD, data model, API contract, UI specs, error handling, security, testing, microtasks and README updated to match.
- Web stack changed from Next.js to React + Vite (`D-027`); `NEXT_PUBLIC_API_BASE_URL` is now `VITE_API_BASE_URL`.
- `D-002` reworded: PostgreSQL is the only system of record, seat holds included; Redis is allowed as a speed layer that never holds the only copy of anything.
- Magic links are now single use. Sessions stay stateless and logout only clears the cookie, so the `D-006` trade-off stays.
- Redis moved out of "Outside services" on the architecture diagram into its own group, "Run by the club, in Docker Compose", beside the API and PostgreSQL; the arrow label is "send · pay · store".
- Rate limits are per minute per IP on sign-in email links, ticket purchase and shop orders (the per-email hourly limit and the email lock were dropped).
- Scheduled jobs: renewal reminders, release unpaid holds (never a paid ticket), queued emails with retries.
- Spring Gala diagram: the 15-minute hold, the "Redis is not used for seat holds" line and the late-payment note.
- `.github/workflows/ci.yml` backend job now starts a Redis 7 service and sets `REDIS_URL`; the web job uses `VITE_API_BASE_URL`.

### Fixed
- The renewal reminder view no longer lists unpaid memberships (the `D-021` part b fix is folded into the semester version).

### Security
- Nothing yet.

## [0.0.1] - 2026-10-10

### Added
- `database/schema.sql`: PostgreSQL schema with 15 tables (members, leadership_roles, payments, memberships, events, ticket_types, tickets, announcements, products, product_variants, orders, order_items, fundraisers, fundraiser_tasks, expenses), a seat-limit trigger, and 7 views (active_members, memberships_due_for_renewal, ticket_availability, event_summary, fundraiser_progress, treasurer_summary, club_balance).
- Verified on PostgreSQL 16: schema loads from scratch; duplicate emails, negative amounts, and invalid payment/expense states are rejected; the seat limit blocks overselling.

### Known issues (tracked in `docs/15_DECISIONS.md`)
- `event_summary` counts unpaid ticket reservations (`D-021`).
- `memberships_due_for_renewal` includes unpaid memberships (`D-021`).
- `payments` has no gateway reference column (`D-020`).
