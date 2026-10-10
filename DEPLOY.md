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

**Keep it running after restarts (Option B):** `powershell -ExecutionPolicy Bypass -File deploy\install-autostart.ps1` registers a Windows logon task (`SkylineBackend`) that starts Docker Desktop if it is closed, brings the stack up, opens the tunnel, and restarts the tunnel if it drops. It writes the current public address to `deploy/current-api-url.txt` and a log to `deploy/autostart.log`. Remove it with `-Remove`. After every reboot or tunnel restart the address changes: run `deployebuild-site.ps1` to rebuild the site against it and upload `frontend\dist` again. Also stop Windows from sleeping while plugged in (Settings > System > Power), or the site goes offline. For an address that never changes, use a real server (below) or a named tunnel on your own domain.

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
