# 13 — Production Checklist

Nothing goes live until every box in sections 1–9 is ticked. Record the date and who ticked it in the release PR.

## 1. Code and quality
- [ ] `main` is green: `database`, `backend`, `web` (and `security`, `mobile` when present)
- [ ] All Phase 1 requirement IDs in `01_PRD.md` have passing tests (`12_TESTING.md` §2)
- [ ] Load test passed: no oversell, p95 purchase < 1 s, no 5xx (`12_TESTING.md` §6)
- [ ] Playwright scene flows pass on staging
- [ ] `CHANGELOG.md` updated, version tagged
- [ ] Open items in `15_DECISIONS.md` that block launch are Accepted or closed (see §10)

## 2. Database
- [ ] Production Postgres 16 provisioned, `sslmode=require`
- [ ] Two roles in place: app (DML only) and migrator (DDL); app role is not superuser
- [ ] Migrations applied from empty database successfully (CI) and on staging
- [ ] Proposed schema changes decided and applied or deliberately skipped: `D-020` (`payments.external_ref`), `D-021` (view fixes)
- [ ] Automated daily backups on; **restore tested** into a scratch database
- [ ] Connection pool sized for the host; slow-query logging on
- [ ] Opening data imported or ledger start date recorded (`05_DATA_SOURCE.md` §3)

## 3. Configuration and secrets
- [ ] All variables in `02_TRD.md` §5 set in production, none shared with staging
- [ ] `JWT_SECRET` long and random; `APP_ENV=production`
- [ ] `CORS_ORIGINS` lists only the real web origins
- [ ] No `.env` or secret in the repository history (secret scan clean)
- [ ] Production GitHub environment has required reviewers

## 4. Security
- [ ] HTTPS everywhere, HSTS on, security headers verified
- [ ] Authorization matrix test passes (`09_SECURITY.md` §3)
- [ ] Rate limits active (`06_API_CONTRACT.md` §6)
- [ ] Receipt bucket private; signed URLs expire; type and size limits enforced
- [ ] `pip-audit`, `npm audit`, CodeQL: no high or critical findings
- [ ] Dependabot enabled

## 5. Payments
- [ ] Gateway account approved for live payments; live keys in production only
- [ ] Webhook URL registered; signature secret set; test event received
- [ ] Real end-to-end payment of a small amount succeeded, webhook marked it paid, payment row correct, then **refunded**
- [ ] Duplicate webhook delivery tested: no double payment
- [ ] Late-payment alert tested; refund runbook written (who refunds, where)
- [ ] Gateway statement reconciliation process agreed with the treasurer

## 6. Email
- [ ] Sending domain verified; SPF, DKIM, DMARC passing
- [ ] Magic link, ticket, announcement, renewal reminder emails received in Gmail, Outlook, and a college mailbox (not spam)
- [ ] Retry and `email_failed` alert tested

## 7. Observability
- [ ] Sentry receiving events from API and web (test error sent)
- [ ] Uptime check on `/ready`; alert goes to a named person
- [ ] Alerts: any `late_payment`, burst of 5xx, failed job, backup failure
- [ ] Logs carry `request_id`; no secrets or tokens in logs (sampled and checked)
- [ ] Jobs scheduled and a first run observed: `expire_reservations`, `renewal_reminders`

## 8. Product and legal
- [ ] Privacy policy and terms published and linked in the footer and at sign-up
- [ ] Data deletion and correction request process named (who, how fast)
- [ ] Accessibility pass on sign-in, events, purchase, check-in (axe + keyboard + one screen-reader run)
- [ ] Error pages (404, 500, maintenance) in place

## 9. Launch rehearsal
- [ ] Officers trained: verify member, record cash dues, door check-in, post announcement
- [ ] **Door drill:** 20 test tickets, two phones, bad network. Admitted, already-used and invalid all show correctly; manual code entry works
- [ ] Treasurer walks through a month of fake data and agrees the balance
- [ ] Fallback for the gala night: printed attendee list exported from `GET /events/{id}/tickets` as a backup
- [ ] Rollback plan understood (§11)

## 10. Open decisions that must be settled before launch
- [ ] `D-009` payment gateway, `D-011` email provider, `D-012` storage, `D-013` hosting
- [ ] `D-019` zero-dues membership behaviour
- [ ] Ledger start: fresh or backfill (`05_DATA_SOURCE.md` §3.2)

## 11. Rollback
1. Stop the bleeding: put the site in maintenance mode, or flip feature flags (`ads_enabled` for ads).
2. Redeploy the previous API image and web build.
3. Run migration `downgrade` **only** if the new migration is not backward compatible and data loss is acceptable; otherwise leave it, because migrations are written to be backward compatible for one release.
4. Check `/ready`, sign-in, events, and one test purchase.
5. Write the incident in `CHANGELOG.md` and `15_DECISIONS.md`; add a regression test.

## 12. Mobile and AdMob release gates (Phase 2)
- [ ] All items in `10_ADMOB.md` §10
- [ ] Store listings, screenshots, privacy details, and age rating complete
- [ ] Production build uses production App and Ad Unit IDs and no test devices
- [ ] Internal testing track build installed and used for a full ticket-to-check-in flow
- [ ] Android and iOS tested on one low-end device each

## 13. First 48 hours
- [ ] Watch Sentry, uptime, payments, and email delivery
- [ ] Spot-check: payments total equals gateway statement for the day
- [ ] Collect officer feedback; log fixes as microtasks
