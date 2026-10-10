# 00 — Master Rules

Rules for every contributor and every AI coding assistant working on the **Student Organization System (SOS)**. If a rule here conflicts with another document, this file wins, then log the conflict in `15_DECISIONS.md`.

## 1. Source-of-truth order
When documents disagree, the higher one wins:

1. The original brief (`Student_Organization_System.pdf`)
2. `database/schema.sql` (and later Alembic migrations)
3. `01_PRD.md`
4. `02_TRD.md` and `03_ARCHITECTURE.md`
5. `06_API_CONTRACT.md`, `07_UI_SPECS.md`
6. Everything else

## 2. Scope rule (most important)
- Build **only** what the brief describes: members and memberships, events and tickets, announcements, merchandise, fundraisers, treasurer finances.
- Anything else (new feature, new table, new column, new vendor) needs a `Proposed` entry in `15_DECISIONS.md` **before** any code is written.
- The only intentional additions beyond the brief are AdMob (mobile client, Phase 2) and the infrastructure needed to run the brief's features (login, payments gateway, email, file storage). Each is logged in `15_DECISIONS.md`.

## 3. Stack rules
| Layer | Choice (see `15_DECISIONS.md`) |
|---|---|
| Database | PostgreSQL 16 only. No other datastore. |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2 |
| Web | Next.js (App Router) + TypeScript |
| Mobile (Phase 2) | Expo / React Native + `react-native-google-mobile-ads` |
| CI | GitHub Actions |

## 4. Data rules
- Money is `NUMERIC(10,2)` in the database, `Decimal` in Python, and a **string** (`"500.00"`) in JSON. Never `float`.
- All timestamps are `timestamptz`, stored and transmitted in UTC (ISO 8601).
- Schema changes happen **only** through a numbered migration. Never edit a deployed table by hand.
- Financial rows (`payments`, `expenses`, `tickets`, `orders`) are never hard-deleted by the API.
- Never trust the client for prices, roles, or stock. The server computes them.
- Use parameterised queries / ORM only. No string-built SQL.

## 5. Code rules
- Layering: `router → service → repository`. Routers contain no business logic; repositories contain no HTTP concepts.
- Every function that touches money or stock runs in **one database transaction**.
- Type hints everywhere in Python; `strict` TypeScript.
- Formatting and linting: `ruff` (+ `ruff format`), `mypy`; `eslint` + `prettier`. CI fails on violations.
- Naming: DB and JSON in `snake_case`; Python modules `snake_case`; React components `PascalCase`.
- No secrets in code, tests, logs, or commit history. Config comes from environment variables only.
- Log with structured JSON and a `request_id`. Never log tokens, full emails in bulk, or payment secrets.

## 6. Workflow rules
- One **microtask** (`14_MICROTASKS.md`) per pull request. Reference its ID in the PR title.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- `main` is protected: CI must pass; at least one review where a second person exists.
- Every user-visible change adds a line to `CHANGELOG.md` under `[Unreleased]`.
- Every non-obvious choice adds an entry to `15_DECISIONS.md`.

## 7. Definition of Done
A microtask is done only when all are true:
- [ ] Behaviour matches the requirement ID in `01_PRD.md`
- [ ] API matches `06_API_CONTRACT.md` (or the contract was updated in the same PR)
- [ ] Errors follow `08_ERROR_HANDLING.md`
- [ ] Tests added per `12_TESTING.md`; CI green
- [ ] No new lint, type, or security warnings
- [ ] `CHANGELOG.md` and (if needed) `15_DECISIONS.md` updated

## 8. Rules for AI coding assistants
1. Read `00`, `01`, `04`, `06` before writing code. Read the relevant others for the task.
2. Do not invent endpoints, columns, tables, roles, or error codes. If something is missing, stop and propose it in `15_DECISIONS.md`.
3. Make small diffs. One microtask at a time. Do not refactor unrelated code.
4. Do not edit `database/schema.sql` after migration `0001` exists. Add a new migration.
5. Never weaken a constraint, test, or security check to make something pass.
6. If a requirement is ambiguous, state the assumption in the PR description and add it to `15_DECISIONS.md` as `Proposed`.
7. Never put real API keys, AdMob production IDs, or personal data in code, fixtures, or examples.

## 9. Forbidden
- Floats for money
- Client-supplied prices, roles, or user IDs trusted as-is
- Deleting financial records
- Ads on check-in, payment, or treasurer screens
- Skipping CI or force-pushing to `main`
- Adding libraries without a reason recorded in the PR
