# Oddoskyline

**One platform to run a student club's events, members, and money.**

Built for the Skyline Student Association: members, tickets, announcements, merchandise, fundraisers, and the treasurer's books, all in one place instead of a spreadsheet, a notebook, cash at the door, and a dozen WhatsApp groups.

> **Hackathon:** TODO hackathon name · **Team:** TODO team name · **Demo video:** TODO link · **Live demo:** TODO link · **Slides:** TODO link

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)

---

## The problem

Today the club runs on sign-ups in a spreadsheet, event tickets sold for cash at the door, a budget kept in a notebook, announcements typed one by one into WhatsApp, and volunteer expenses reimbursed after chasing receipts.

> Members lose track of events, money goes missing, and nobody knows who still owes what.

## The solution

A single system with one database behind it. Every rupee that comes in or goes out is recorded once, and anyone on the team can see where the club stands at a glance.

| A moment in the semester | What the system does |
|---|---|
| **A new student joins** | Memberships are bought one semester at a time, in a membership type the club defines, and record the dues; an officer can check in seconds whether someone is an active member this semester; members get a renewal reminder before their semester ends; members automatically get member prices |
| **Selling tickets for the spring gala** | Online sales to members and non-members, with member and non-member prices, a hard seat limit and a smaller seat limit for non-members; every ticket gets a QR code; door check-in without a printed list; afterwards: tickets sold, people who showed up, money made |
| **Announcing the next meeting** | One post goes on the website and to every member's email, and stays on record with who said what and when |
| **Ordering hoodies and T-shirts** | Members order from their phones at any hour, pick a size, pay online; non-members can order too, from a limited share of each product that is handed out first come, first served; stock per size is tracked and can never go negative |
| **Planning a fundraiser** | Tasks with an owner, a due date, and a status; progress and money raised against the goal on one screen |
| **The treasurer closes the books** | Money in (dues, tickets, merchandise, fundraisers), money out (reimbursed expenses with receipts), and what is left, plus a list of who still owes what |

## Project status

This table is the honest state of the repo. Update it as you ship.

| Area | Status |
|---|---|
| Requirements and design documents (`docs/`) | Done |
| PostgreSQL schema (`database/schema.sql`) | Done: 17 tables, 7 views. Loads from scratch on PostgreSQL 16; triggers (seat limits, non-member goodie limit), constraints, and views behaviour-tested, including semesters and membership types |
| Architecture and data diagrams | Done: six diagrams (architecture, data model, membership by semester, gala tickets and door, money, roles) on the design canvas |
| CI pipeline (`.github/workflows/ci.yml`) | Written; runs once `backend/` and `web/` exist |
| Backend API (FastAPI) | Planned, see [`docs/14_MICROTASKS.md`](docs/14_MICROTASKS.md) |
| Web app (React + Vite) with role-based login pages | Planned |
| Redis speed layer (run by the club, in Docker Compose) | Planned |
| Mobile app + AdMob banner ads | Stretch goal (Phase 2) |

## Architecture

```mermaid
flowchart LR
    U[Members, officers, treasurer] --> W[React + Vite web<br/>role-based login pages]
    U --> M[Mobile app - Phase 2]
    W --> API[FastAPI backend]
    M --> API
    API --> DB[(PostgreSQL)]
    API --> RD[(Redis speed layer<br/>run by the club)]
    API --> PG[Payment gateway]
    PG -- signed webhook --> API
    API --> EM[Email provider]
    API --> ST[(Receipt storage)]
```

Full details: [`docs/03_ARCHITECTURE.md`](docs/03_ARCHITECTURE.md).

### Design decisions we care about
- **No overselling.** Seat limits (total and non-member) are enforced by a row lock in the service and a database trigger as a backstop. Stock updates are a single atomic statement that cannot go below zero, and the non-member share of each goodie is handed out first come, first served under a lock.
- **Semester-wise membership.** A membership is one member, one semester and one type; it is active only while that semester runs, and the renewal reminder follows the semester's end date.
- **Atomic check-in.** A ticket can be admitted once; two phones scanning the same code at the same moment cannot both succeed.
- **Prices come from the server.** Member versus non-member pricing is decided per ticket holder, never trusted from the browser.
- **One income ledger.** Dues, tickets, merchandise, and fundraiser money all land in a single `payments` table, so the treasurer's totals can't drift from reality.
- **Money is never a float.** `NUMERIC(10,2)` in the database, strings in the API.
- **Paid by webhook only.** Only a verified payment-gateway webhook marks something as paid, and repeated deliveries do nothing.
- **Role-based login pages.** Members, officers and the treasurer each have their own sign-in page. Roles nest (treasurer includes officer includes member) and are read from the database on every request; the API enforces them, and the web app's route guards only hide screens.
- **Redis is a speed layer only.** It has four jobs: 30 to 60 s copies of four reports, rate limits, one-time sign-in links and the email queue. Seat holds are not in Redis: a hold is an unpaid ticket row in PostgreSQL, kept for 15 minutes, so the last seat is always decided in one locked database step. If Redis is empty, wrong or down, no record is lost and buying, ordering and door check-in still work (only new sign-in links wait).

## Tech stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL 16 |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| Web | React, Vite, TypeScript, React Router (single-page app) |
| Speed layer | Redis 7 (run by the club, in Docker Compose) |
| Login | Email magic link, three role-based login pages (member, officer, treasurer) |
| Mobile (Phase 2) | Expo / React Native, Google AdMob |
| Payments | Hosted-checkout gateway (Razorpay proposed) |
| CI | GitHub Actions |
| Tests | pytest, Playwright, k6 |

Which parts are decided and which are still proposals: [`docs/15_DECISIONS.md`](docs/15_DECISIONS.md).

## Getting started

### Prerequisites
Docker (or a local PostgreSQL 16 and Redis 7) and `psql`. Python 3.12 and Node 22 once the backend and web apps are in place.

### 1. Database (works today)
```bash
docker run --name oddoskyline-db -d \
  -e POSTGRES_USER=sos -e POSTGRES_PASSWORD=sos -e POSTGRES_DB=sos \
  -p 5432:5432 postgres:16

psql "postgresql://sos:sos@localhost:5432/sos" -v ON_ERROR_STOP=1 -f database/schema.sql
```
Check it: `psql "postgresql://sos:sos@localhost:5432/sos" -c "SELECT * FROM club_balance;"`

Redis (needed by the backend, not by the schema):
```bash
docker run --name oddoskyline-redis -d -p 6379:6379 redis:7
```

### 2. Backend (after microtasks F-03 and F-04)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp ../.env.example .env            # fill in values (DATABASE_URL, REDIS_URL, JWT_SECRET, ...)
alembic upgrade head
uvicorn app.main:app --reload      # http://localhost:8000/docs
```

### 3. Web (after microtask F-08)
```bash
cd web
npm ci
npm run dev                         # http://localhost:5173 (Vite), proxies /api to the backend
```
Login pages: `/login` (member), `/officer/login`, `/treasurer/login`. Set `VITE_API_BASE_URL` for builds; it is public, so never put a secret in it.

### Configuration
All settings come from environment variables; the full list is in [`docs/02_TRD.md`](docs/02_TRD.md) §5. Never commit real secrets.

### Tests
```bash
cd backend && pytest                # real PostgreSQL required
cd web && npm test
```

## Demo walkthrough (about 3 minutes)
1. **Sign up** a new student on the member page, record cash dues as an officer (signed in on the officer page), then **verify** them: Active, with expiry date.
2. **Buy two gala tickets** (one member, one non-member) and see two different prices; pay in the gateway's test mode and receive QR tickets. Keep buying as a non-member until the non-member seats run out: members can still buy.
3. **Door check-in:** scan a ticket (green, admitted), scan it again (amber, already used).
4. **Post an announcement:** it appears on the site and is emailed to every member.
5. **Order a hoodie** in size M and watch the stock drop.
6. **Open the fundraiser board:** tasks by status, progress bar, money raised against the goal.
7. **Treasurer dashboard:** money in by category, money out, balance, and who still owes what.
8. **Roles:** sign in as a plain member on the officer page and see "No access"; sign in as the treasurer and open the dashboard; use a sign-in link twice and see it refused.

## Repository structure
```
database/      schema.sql (baseline migration)
backend/       FastAPI app: api, services, repositories, models, jobs
web/           React + Vite app
mobile/        Expo app (Phase 2)
docs/          requirements, design, API, security, testing, checklists
.github/       GitHub Actions workflows
CHANGELOG.md
```

## Documentation

| Doc | What is in it |
|---|---|
| [00 Master rules](docs/00_MASTER_RULES.md) | Ground rules for contributors and AI assistants |
| [01 PRD](docs/01_PRD.md) | Requirements by scene, roles, success measures |
| [02 TRD](docs/02_TRD.md) | Technology, business rules, jobs, configuration |
| [03 Architecture](docs/03_ARCHITECTURE.md) | Components, flows, deployment |
| [04 Data model](docs/04_DATA_MODEL.md) | Tables, views, state machines, known limitations |
| [05 Data source](docs/05_DATA_SOURCE.md) | Where data comes from, imports, privacy inventory |
| [06 API contract](docs/06_API_CONTRACT.md) | Endpoints, formats, examples |
| [07 UI specs](docs/07_UI_SPECS.md) | Screens, tokens, wireframes |
| [08 Error handling](docs/08_ERROR_HANDLING.md) | Error codes and client behaviour |
| [09 Security](docs/09_SECURITY.md) | Auth, roles, payments, privacy |
| [10 AdMob](docs/10_ADMOB.md) | Ad placement rules and release gates |
| [11 GitHub Actions](docs/11_GITHUB_ACTIONS.md) | Pipelines and release flow |
| [12 Testing](docs/12_TESTING.md) | Test strategy and must-have cases |
| [13 Production checklist](docs/13_PRODUCTION_CHECKLIST.md) | Launch gates |
| [14 Microtasks](docs/14_MICROTASKS.md) | The build plan, task by task |
| [15 Decisions](docs/15_DECISIONS.md) | What is decided and what is open |
| [Changelog](CHANGELOG.md) | Version history |

## Roadmap
- **Phase 1:** backend + responsive web covering all six scenes
- **Phase 2:** mobile app for members and door check-in, with banner ads on list screens only (never on check-in, payment, or finance screens)
- **Phase 3:** launch hardening using the production checklist

## Contributing
Work one microtask at a time from [`docs/14_MICROTASKS.md`](docs/14_MICROTASKS.md), one pull request each. Follow [`docs/00_MASTER_RULES.md`](docs/00_MASTER_RULES.md), keep CI green, and add a line to `CHANGELOG.md`.

## Team

| Name | Role | Links |
|---|---|---|
| TODO | TODO | TODO |
| TODO | TODO | TODO |

## License
TODO: choose a license and add a `LICENSE` file.

## Acknowledgements
Built from the "Student Organization System" challenge brief, following the Skyline Student Association scenario.
