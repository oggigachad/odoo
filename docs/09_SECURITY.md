# 09 — Security

Applies to API, web, mobile, database, and CI. Nothing here replaces a legal review of privacy obligations.

## 1. What we protect
Member personal data (name, email, phone), the club's money records, ticket integrity (no forged or reused tickets), and receipts.

## 2. Authentication
- Passwordless **email magic link** on three role-based login pages: member, officer, treasurer (`D-029`). `POST /auth/magic-link` always returns `202`, whether or not the email exists (no account enumeration).
- Magic-link token: signed, single purpose, expires in 15 minutes, sent only to the member's email, and **single use**: a hash of it is stored in Redis (`signin:{token}`, 15 min) and deleted atomically when exchanged, so a copied or forwarded link stops working after the first use.
- The `portal` value in the request only chooses where the person lands. It is never read as a permission.
- Session: signed JWT, 24-hour lifetime, claims limited to member ID, expiry and a session id (`jti`, used in logs). Roles are **not** stored in the token; they are resolved from the database on each request, so removing an officer takes effect immediately.
- Sign-out: `POST /auth/logout` clears the session cookie. The session itself is stateless and stays valid until its 24 h expiry; there is no signed-out list in Redis.
- Web: session in an `HttpOnly; Secure; SameSite=Lax` cookie. The API and the web app must share a site (for example `api.club.example.org` and `club.example.org`), or the web host proxies `/api`. The cookie is never readable from JavaScript, and the single-page app keeps no token in `localStorage`. Mobile: bearer token in the platform secure store (Keychain / Keystore).
- Trade-offs (`D-006`, `D-028`): signing in needs both email and Redis, and a copied session cookie stays usable until it expires even after sign-out. Rotate `JWT_SECRET` in an emergency (signs everyone out).

## 3. Authorization
| Action | Public | Member | Officer | Treasurer |
|---|---|---|---|---|
| View events, announcements, products | ✔ | ✔ | ✔ | ✔ |
| Buy tickets | ✔ | ✔ | ✔ | ✔ |
| Own profile, tickets, orders, expenses | | ✔ (own) | ✔ | ✔ |
| Place merchandise orders | ✔ (non-member price, within the non-member limit; name and email required) | ✔ | ✔ | ✔ |
| Manage members, semesters, membership types, events, products (incl. non-member limits), fundraisers | | | ✔ | ✔ |
| Check in tickets | | | ✔ | ✔ |
| Post announcements | | | ✔ | ✔ |
| Record cash payments | | | ✔ | ✔ |
| View finance summary, ledger, outstanding | | | ✔ | ✔ |
| Approve, reject, reimburse expenses | | | | ✔ (not own) |
- Officer = leadership role in the current term year; Treasurer = position `Treasurer` in that term.
- "Own" checks compare the token's member ID to the row's owner on the server. IDs in URLs are never trusted.
- Every endpoint declares its required role in code, and a test asserts it (`12_TESTING.md`).

### Role-based access control (`D-029`)
- Roles nest: Treasurer includes Officer, Officer includes Member, Member includes Visitor. The Treasurer column above repeats the Officer rows for that reason.
- The API is the only enforcement point. A FastAPI dependency `require_role(...)` runs on every route and reads the roles from PostgreSQL on every request. Route guards in the React app only hide screens and send people to the right login page.
- A person who signs in on the wrong role page is a member with no extra access. Signing in on `/treasurer/login` never makes anyone a treasurer.
- Officer and treasurer accounts are created only through `leadership_roles` by an officer. The login pages offer no sign-up for them.
- Redis is never consulted to decide a role.

## 4. Input and output
- Validate everything with Pydantic; reject unknown fields.
- Parameterised SQL only. No dynamic SQL from user input.
- Escape on output (React does by default); no `dangerouslySetInnerHTML` for announcements. Render announcement bodies as plain text or sanitised Markdown.
- Receipts: type allow-list (JPEG, PNG, PDF), max 5 MB, uploaded through a short-lived signed URL, bucket private, viewed through short-lived signed GET URLs.

## 5. Tickets
- `ticket_code` is a random UUID, never sequential.
- Check-in is a single atomic `UPDATE`, so a code cannot be used twice.
- The ticket page reveals only the holder's name, event, and status.
- Check-in endpoint is officer-only and rate-limited.

## 6. Payments
- Hosted checkout: card and UPI details never reach our servers or logs.
- Webhooks accepted only with a valid HMAC signature; the secret lives in environment variables.
- The amount charged is computed on the server, never taken from the client.
- Do not trust the browser's "payment success" redirect; only the verified webhook marks things paid.

## 7. Transport, headers, CORS
- HTTPS only, HSTS enabled.
- Security headers on web: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`.
- CORS allow-list from `CORS_ORIGINS` (no wildcard); credentials allowed only for those origins.
- The Vite build is static: no secrets in `VITE_` variables (they are public), hashed asset file names, `index.html` served with `Cache-Control: no-cache`, CSP with `script-src 'self'` and no inline scripts, `connect-src` limited to the API origin.
- CSRF: cookie sessions use `SameSite=Lax` and every state-changing request must carry a custom header (`X-Requested-With`) that cross-site forms cannot set.

## 8. Rate limiting
As in `06_API_CONTRACT.md` §6. The counters for sign-in email links, ticket purchase and shop orders live in Redis (`rate:{endpoint}:{ip}`, 1 min); the other limits are not kept in Redis. If Redis is unreachable the Redis limits are skipped and logged, so the database-side protections (row locks, constraints, the seat and goodie triggers) stay the real safeguards.

## 8a. Redis
- Reachable only from the API and the jobs (private network or allow-listed), with a password and TLS in staging and production. Never exposed to the internet.
- Holds no member records, receipts or payment details. The email queue holds recipient email addresses and message content until each email is sent, so the same access rules apply as for the database. Sign-in links are stored as a hash, never as a usable link.
- Every key has a TTL (except the `queue:emails` list) and the `oddo:v1:` prefix; `maxmemory-policy volatile-lru`; `FLUSHALL`, `CONFIG` and `KEYS` disabled for the app's user where the host allows it.
- Separate instance (or at least separate password) for staging and production.

## 9. Secrets and configuration
- Environment variables only; `.env` files git-ignored; `.env.example` has placeholders.
- GitHub Actions secrets per environment; production secrets only on the production environment (required reviewers).
- Different secrets for staging and production. No production data in staging.
- Rotate on suspicion and when an officer with access leaves.

## 10. Database
- Separate roles: **app** (no superuser, no DDL, DML on needed tables) and **migrator** (DDL, used only by deploy).
- Encrypted at rest and in transit (managed Postgres, `sslmode=require`).
- Daily backups; restore tested before launch.
- No hard deletes of financial rows through the API.

## 11. Privacy
- Collect only name, email, optional phone.
- Provide a privacy policy and terms before launch; honour access, correction, and deletion requests (India's DPDP Act, 2023, applies; get the club's college or a lawyer to confirm duties).
- Delete or anonymise a member's profile on request while preserving financial totals.
- Announcement emails go to members only; an unsubscribe option is an open question (`01_PRD.md` §9).
- Ads (Phase 2): consent and age handling in `10_ADMOB.md`.

## 12. Audit trail
Already recorded by the schema: `announcements.posted_by`, `tickets.checked_in_by` and `checked_in_at`, `expenses.reimbursed_at`, `memberships.renewal_reminder_sent_at`. Add structured log events for logins (with the login page used), sign-outs, role changes, cash payments, and expense decisions, retained 30 days.

## 13. Supply chain and CI
- Dependabot for pip, npm, and GitHub Actions.
- CodeQL, `pip-audit`, `npm audit` (fail on high severity), and secret scanning (`gitleaks`) in CI (`11_GITHUB_ACTIONS.md`).
- Pin GitHub Actions to a major version or commit SHA; least-privilege `permissions:` on every workflow.
- Lock files committed.

## 14. Incident response (small club version)
1. Contain: rotate the affected secret, disable the feature, or take the site to maintenance mode.
2. Assess: what data, which members, which time range (logs by `request_id`).
3. Notify affected members and the college as required.
4. Fix, add a regression test, record in `15_DECISIONS.md` and `CHANGELOG.md`.
