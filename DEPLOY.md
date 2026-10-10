# Deploying Skyline to production

Layout: the **website** (static React build) runs on **Vercel or Netlify**; the **API, PostgreSQL, Redis and MinIO** run together on **one Linux server** with Docker, behind Caddy, which gets and renews HTTPS certificates by itself.

```
Browser ──► Vercel / Netlify  (https://skyline.example.com)        static site
   │
   └──────► Caddy (443) ► api ► postgres / redis / minio           https://api.example.com
```

The API must be on HTTPS and on a **domain name** (browsers block an HTTPS site from calling a plain-HTTP API, and Caddy cannot issue a certificate for a bare IP). No domain yet? `api.<your-server-ip>.sslip.io` works as a free temporary name, for example `api.203.0.113.7.sslip.io`.

## 0. What you need
- A Linux server (Ubuntu 22.04/24.04, 2 GB RAM or more, ports 80 and 443 open) with Docker: `curl -fsSL https://get.docker.com | sh`
- A domain for the API (`api.example.com`) with an **A record** pointing at the server's IP
- A Vercel or Netlify account (the site can use any domain they give you)
- Production keys: Gmail App Password(s), Razorpay **live** keys, optional Google OAuth client

## Option B: no server yet, run the backend on your own PC and publish it with a tunnel
Good for a demo or evaluation; not for lasting production (the PC must stay on, Docker Desktop running, and the free Cloudflare address changes whenever the tunnel restarts).
```powershell
cd deploy
copy .env.production.example .env.production   # fill in; FRONTEND_URL and CORS_ORIGINS = your Netlify address
./start-tunnel.ps1                              # starts the stack (no Caddy) and prints https://<random>.trycloudflare.com
```
Then build the site with that address and upload `frontend/dist` to Netlify (drag and drop) or set `VITE_API_URL` in Netlify and redeploy: `cd frontend; $env:VITE_API_URL='https://<random>.trycloudflare.com'; npm run build`. For a fixed address use a named Cloudflare tunnel on your own domain, or a real server (below).

**Keep it running after restarts (Option B):** `powershell -ExecutionPolicy Bypass -File deploy\install-autostart.ps1` registers a Windows logon task (`SkylineBackend`) that starts Docker Desktop if it is closed, brings the stack up, opens the tunnel, and restarts the tunnel if it drops. It writes the current public address to `deploy/current-api-url.txt` and a log to `deploy/autostart.log`. Remove it with `-Remove`. After every reboot or tunnel restart the address changes: run `deploy
ebuild-site.ps1` to rebuild the site against it and upload `frontend\dist` again. Also stop Windows from sleeping while plugged in (Settings > System > Power), or the site goes offline. For an address that never changes, use a real server (below) or a named tunnel on your own domain.

## 1. Backend on the server
```bash
git clone https://github.com/oggigachad/odoo.git /opt/skyline && cd /opt/skyline/deploy
cp .env.production.example .env.production
nano .env.production            # fill in every value; generate secrets with: openssl rand -hex 32
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api   # wait for "Application startup complete"
curl https://api.example.com/api/v1/stats                                           # {"members":1,"upcoming_events":0}
```
On first start the API creates all tables and the first Admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`; it refuses the default password in production). Open ports 80 and 443 only; nothing else is published.

## 2. Website on Vercel or Netlify
0. Two equivalent setups are in the repository: `frontend/vercel.json` + `frontend/netlify.toml` (use when the project root is `frontend`) and `vercel.json` + `netlify.toml` at the repository root (use when you import the whole repository without choosing a root; they build from `frontend` and publish `frontend/dist`).
1. Import the GitHub repository and set the **root directory to `frontend`** (build `npm run build`, output `dist`; `vercel.json` / `netlify.toml` already contain this, the single-page-app rewrite and security headers).
2. Add environment variables (see `frontend/.env.production.example`): `VITE_API_URL=https://api.example.com` and, if you use it, `VITE_GOOGLE_CLIENT_ID`.
3. Deploy. Then put the site's final address in the server's `deploy/.env.production` as `FRONTEND_URL` (add any extra addresses, such as the `*.vercel.app` one, to `CORS_ORIGINS`) and restart: `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`.

`FRONTEND_URL` matters: event poster QR codes, e-mail buttons and calendar links all point to it, and the API only accepts browser calls and live-update connections from it and `CORS_ORIGINS`.

## 3. Switch on the integrations
- **Razorpay:** live keys in `.env.production`; in the Razorpay dashboard add the webhook `https://api.example.com/api/v1/webhooks/razorpay` for payment events with the same secret as `RAZORPAY_WEBHOOK_SECRET`.
- **Google sign-in (optional):** in Google Cloud add the site address under *Authorized JavaScript origins* and set `GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (site).
- **E-mail:** Gmail with an App Password, port 465. Send yourself a sign-up code to confirm delivery.
- **First login:** sign in as the Admin, change the password in Settings, then have staff sign up (staff domains) and assign Officer and Treasurer under Dashboard > Admin.

## 4. Go-live checklist
- [ ] `APP_ENV=production` is set by the compose file; `/docs` returns 404 and sign-in codes are never in API responses
- [ ] `https://api.example.com/api/v1/stats` returns 200 and the site loads, shows "Live Sync" and signs in
- [ ] A test ticket is bought with a Razorpay payment and the QR scans (phone camera needs HTTPS: it has it)
- [ ] A product picture uploads (MinIO) and the shop shows it
- [ ] `deploy/backup.sh` is scheduled and its output is copied off the server
- [ ] Every secret is new (nothing reused from development or pasted in chat), and `deploy/.env.production` is not in git

## 5. Operating it
| Task | Command (from `/opt/skyline/deploy`) |
| :--- | :--- |
| Update to the latest code | `git pull && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build` |
| Logs | `docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api` |
| Status | `docker compose --env-file .env.production -f docker-compose.prod.yml ps` |
| Backup now | `./backup.sh` (schedule nightly: `0 3 * * * /opt/skyline/deploy/backup.sh`) |
| Restore the database | `gunzip -c db_YYYYMMDD_HHMM.sql.gz \| docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB` |
| Roll back a bad release | `git checkout <previous-commit> && docker compose ... up -d --build` (the database is only ever extended by idempotent `ADD COLUMN/INDEX IF NOT EXISTS` statements, so the previous code still runs) |

Data lives in Docker volumes (`postgres_data`, `redis_data`, `minio_data`, `caddy_data`) and survives restarts and updates. `docker compose down -v` deletes them: never run it in production.

## 6. Scaling and cost notes
- The API runs one process on purpose (the reminder, e-mail and hold-cleanup loops live inside it). One small server handles a campus club comfortably; the stack idled at about 260 MB of memory in testing.
- To grow: move PostgreSQL to a managed database (set `DATABASE_URL`), and MinIO to S3-compatible storage (point `MINIO_ENDPOINT` at it). To run more than one API process first move the background loops into a separate worker process.
- `frontend/public/signin.mp4` is 72 MB. Compress it (for example to under 8 MB with ffmpeg) before deploying to keep page loads and hosting bandwidth small.

## 7. Verified before this guide was written
The stack was built from scratch and run locally exactly as in step 1 (with `API_DOMAIN=localhost`): tables and the Admin were created automatically, HTTPS and HSTS were served by Caddy, `/docs` was disabled, sign-in worked, picture upload and thumbnail went through MinIO, CSV, Excel and PDF reports (with the logo) and the ticket PDF rendered, CORS accepted the configured site and rejected another, and the frontend built for production with `npm run build`. Not testable without your accounts: your DNS and certificate, live Razorpay keys, Gmail delivery, Vercel or Netlify itself.

## Logins for each role (production)
Only the first Admin exists after a fresh start, and sign-up always creates a Guest. To create one working login per role plus the current semester and the membership prices (what the Membership tab shows):
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api python -m scripts.role_accounts          # creates what is missing, prints new passwords once
docker compose --env-file .env.production -f docker-compose.prod.yml exec api python -m scripts.role_accounts --reset  # new passwords for all of them
```
It makes `treasurer@company.com` (Treasurer), `officer@company.com` (Officer), `member@student.edu.in` (Member, dues paid) and `guest@student.edu.in` (Guest). Change the prices and add semesters under Dashboard > Admin. Passwords are random, are not shown on the website, and should be changed in Settings after the first sign-in.

## Keeping the data (events, shop, members, pictures)
Everything the site saves is written to PostgreSQL and MinIO, which live in Docker **volumes** (`skyline_postgres_data`, `skyline_minio_data`, `skyline_redis_data`). Restarting Windows, Docker or the containers, `docker compose down` and `up`, and reloading the website never delete it (this was tested). Only `docker compose down -v`, deleting the volumes in Docker Desktop, or losing the disk does.
- **Backup (Windows):** `powershell -ExecutionPolicy Bypass -File deploy\backup.ps1 -Install` backs up now and schedules a daily 03:00 run to `%USERPROFILE%\Backups\skyline` (database `db_*.sql.gz`, pictures `media_*.zip`, kept 14 days). Copy that folder to another disk or cloud drive regularly.
- **Restore the database:** `gunzip -c db_<time>.sql.gz | docker exec -i skyline-postgres-1 sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'` into an empty database. **Pictures:** stop MinIO and copy the unzipped folder back to `/data` (`docker cp <folder>/. skyline-minio-1:/data`), then start it.


## E-mail delivery (sign-up and sign-in codes, reminders, announcements)
**The problem:** from a home or campus network Gmail's SMTP ports (465 and 587) are filtered at random. Measured here: connections timed out about half the time and took 16 to 80 seconds when they worked, while ordinary HTTPS (port 443) answered instantly. Codes arrived late or not at all.

**What the server does now (in this order):**
1. **An HTTPS e-mail service**, if one is configured: `BREVO_API_KEY` (free plan; verify the `EMAIL_FROM` address as a sender), or `RESEND_API_KEY`, or the Gmail relay below. This is the reliable option.
2. **SMTP** as backup: every mailbox on both ports 465 and 587, two rounds, 12 s per try.
3. A failed message is retried up to 5 times with growing pauses, without holding up other e-mails.

**Gmail relay over HTTPS (no new account needed):** in Google Apps Script (script.google.com, signed in as the sending Gmail) create a project, paste the code below with your own long random secret, then Deploy > New deployment > Web app, "Execute as: me", "Who has access: Anyone". Put the web-app URL in `MAIL_RELAY_URL` and the secret in `MAIL_RELAY_TOKEN`, then `docker compose ... up -d`.
```js
function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  if (d.token !== 'PUT-A-LONG-RANDOM-SECRET-HERE') return ContentService.createTextOutput('forbidden');
  GmailApp.sendEmail(d.to, d.subject, d.text, { htmlBody: d.html, name: 'Skyline Student Association' });
  return ContentService.createTextOutput('ok');
}
```
Gmail limits a normal account to about 100 recipients a day.

## Testing every use case
`deploy/usecase_test.py` exercises the deployed build end to end: public pages and security headers, sign-up with a code, sign-in (password and code), all five roles and what each may do, events and tickets (free and paid, per-person limits, wrong and forged payments, signed QR PDF, the door, offline batch, registration link), membership (request, retry, payment, member status), the shop (checkout, limits, stock, payment, cancel, delete), announcements and notifications, fundraisers and tasks, expenses and the treasury, all eight reports and their exports, live updates over the WebSocket, and deleting events. It uses real Razorpay test orders.
It runs against a second copy of the production container with e-mail switched off and its own Redis database, so no mail can leave; it tags everything `E2E` and `deploy/e2e-cleanup.sql` removes it afterwards. Last result: **136 of 136 passed**. How to run it is in the comments at the top of the script; the second container is started like the live one with `SMTP_*`, `BREVO_API_KEY`, `RESEND_API_KEY` and `MAIL_RELAY_*` emptied, `REDIS_URL` ending in `/1` and port 8002 published on 127.0.0.1.
