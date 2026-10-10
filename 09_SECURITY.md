# 09 — Security

Applies to API, web, mobile, database, and CI. Nothing here replaces a legal review of privacy obligations.

## 1. What we protect
Member personal data (name, email, phone), the club's money records, ticket integrity (no forged or reused tickets), and receipts.

## 2. Authentication
- Passwordless **email magic link**. `POST /auth/magic-link` always returns `202`, whether or not the email exists (no account enumeration).
- Magic-link token: signed, single purpose, expires in 15 minutes, sent only to the member's email.
- Session: signed JWT, 24-hour lifetime, claims limited to member ID and expiry. Roles are **not** stored in the token; they are resolved from the database on each request, so removing an officer takes effect immediately.
- Web: session in an `HttpOnly; Secure; SameSite=Lax` cookie. Mobile: bearer token in the platform secure store (Keychain / Keystore).
- Known trade-off (`D-006`): tokens are stateless, so there is no per-token revoke before expiry. Rotate `JWT_SECRET` in an emergency (signs everyone out).

## 3. Authorization
| Action | Public | Member | Officer | Treasurer |
|---|---|---|---|---|
| View events, announcements, products | ✔ | ✔ | ✔ | ✔ |
| Buy tickets | ✔ | ✔ | ✔ | ✔ |
| Own profile, tickets, orders, expenses | | ✔ (own) | ✔ | ✔ |
| Place merchandise orders | | ✔ | ✔ | ✔ |
| Manage members, events, products, fundraisers | | | ✔ | ✔ |
| Check in tickets | | | ✔ | ✔ |
| Post announcements | | | ✔ | ✔ |
| Record cash payments | | | ✔ | ✔ |
| View finance summary, ledger, outstanding | | | ✔ | ✔ |
| Approve, reject, reimburse expenses | | | | ✔ (not own) |
- Officer = leadership role in the current term year; Treasurer = position `Treasurer` in that term.
- "Own" checks compare the token's member ID to the row's owner on the server. IDs in URLs are never trusted.
- Every endpoint declares its required role in code, and a test asserts it (`12_TESTING.md`).

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
- CORS allow-list from `CORS_ORIGINS` (no wildcard).
- CSRF: cookie sessions use `SameSite=Lax` and every state-changing request must carry a custom header (`X-Requested-With`) that cross-site forms cannot set.

## 8. Rate limiting
As in `06_API_CONTRACT.md` §6. Also lock a magic-link email after repeated failed token exchanges.

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
Already recorded by the schema: `announcements.posted_by`, `tickets.checked_in_by` and `checked_in_at`, `expenses.reimbursed_at`, `memberships.renewal_reminder_sent_at`. Add structured log events for logins, role changes, cash payments, and expense decisions, retained 30 days.

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
