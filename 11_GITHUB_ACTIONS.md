# 11 — GitHub Actions

Automation that keeps `main` always releasable. The working CI file is `github-workflows/ci.yml` in this kit; copy it to `.github/workflows/ci.yml`.

## 1. Workflows
| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Pull request, push to `main` | Schema loads, backend lint/type/test, web lint/type/test/build |
| `security.yml` | PR, weekly schedule | CodeQL, dependency review, secret scan, `pip-audit`, `npm audit` |
| `mobile.yml` (Phase 2) | PR touching `mobile/` | Type-check, lint, unit tests, EAS build check |
| `deploy-staging.yml` | Push to `main` | Run migrations on staging, deploy API and web |
| `deploy-production.yml` | Tag `v*.*.*` | Same for production, behind manual approval |
| `jobs-fallback.yml` (optional) | Daily cron | Triggers `renewal_reminders` if the host scheduler is unavailable |

`ci.yml` is provided. The rest are microtasks (`14_MICROTASKS.md`, group CI) because they depend on hosting and secrets decisions (`D-013`).

## 2. `ci.yml` behaviour
1. **database:** start Postgres 16, load `database/schema.sql` with `ON_ERROR_STOP`, smoke-test the views.
2. **backend:** Python 3.12, install dependencies, `ruff check`, `ruff format --check`, `mypy`, `alembic upgrade head`, `pytest` with coverage gate (80%).
3. **web:** Node 22, `npm ci`, lint, type-check, unit tests, production build.
Concurrency: a new push cancels the older run for the same branch. Permissions: read-only by default.
Prerequisite: the `backend/` and `web/` projects exist with the scripts named in the file (`lint`, `typecheck`, `test`, `build`).

## 3. Required secrets and variables
| Name | Where | Used by |
|---|---|---|
| `STAGING_DATABASE_URL`, `PRODUCTION_DATABASE_URL` | Environment secrets | Deploy migrations |
| `DEPLOY_TOKEN` (host-specific) | Environment secret | Deploy API |
| `VERCEL_TOKEN`, org and project IDs | Environment secrets | Deploy web |
| `EXPO_TOKEN` | Repository secret | Mobile builds |
| `SENTRY_AUTH_TOKEN` | Environment secret | Source maps |
CI itself needs **no** production secrets. Pull requests from forks never receive secrets.

## 4. Environments and approvals
- `staging`: auto-deploy from `main`.
- `production`: deploys only from version tags; requires approval from a named reviewer; secrets scoped to this environment.

## 5. Branch protection on `main`
- Require pull request, require status checks `database`, `backend`, `web` (and `security` once added).
- Require branches to be up to date.
- No force pushes, no deletions.
- Require one review when a second contributor exists.

## 6. Release flow
1. Move `[Unreleased]` entries in `CHANGELOG.md` under a new version heading.
2. Merge to `main`; staging deploys automatically; smoke-test.
3. Tag `vX.Y.Z`; production workflow waits for approval.
4. Deploy order: **migrations first**, then API, then web. Migrations must be backward compatible with the previous API version.
5. Post-deploy smoke checks: `/ready`, sign-in, load events page, one test ticket purchase in test mode (staging) or a ₹1 live check (production, refund afterwards).
6. If checks fail: roll back to the previous image and run the migration `downgrade` only if it is safe (`13_PRODUCTION_CHECKLIST.md`).

## 7. Deploy workflow shape (to fill once hosting is chosen)
```yaml
on:
  push:
    tags: ['v*.*.*']
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production        # approval gate
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@v4
      - name: Run migrations
        run: alembic upgrade head   # with PRODUCTION_DATABASE_URL
      - name: Deploy API
        run: echo "host-specific step"
      - name: Deploy web
        run: echo "host-specific step"
```

## 8. Dependabot
Weekly updates for `pip` (`/backend`), `npm` (`/web`, `/mobile`), and `github-actions` (`/`). Group minor and patch updates; each PR must pass CI.

## 9. Rules for workflows
- Least privilege: set `permissions:` explicitly.
- Pin third-party actions to a major version at least; prefer commit SHAs for non-GitHub actions.
- Cache dependencies; keep the whole CI run under 10 minutes.
- Never echo secrets; never run untrusted PR code with secrets (`pull_request_target` is not used).
