# Deployment

The app is **not deployed yet**. This is the plan for the first deployment and the reference for production configuration. What still blocks a launch is in [production-readiness.md](production-readiness.md).

## 1. Hosting decision

Goal: a small public portfolio app at **€0 per month** if that is reliable enough, without rewriting the application. Provider terms were checked on 2026-11-17 (sources in §11). Recheck them before signing up: free tiers change often, and several changed during 2026.

### What the app needs from a host

- A long-running Node 22 process (Express, server-side sessions, native `argon2` and `sharp`). Serverless functions (Cloudflare Workers, Vercel/Netlify functions) would need a rewrite: native modules, request-body limits below the 25 MB photo uploads, and per-request database connections.
- **Persistent storage for photos.** `FileStorage` has only a local-disk implementation. A host with an ephemeral filesystem loses every photo on restart unless an object-storage implementation is written first.
- **A MongoDB replica set** (transactions). Atlas clusters, including the free tier, are replica sets.
- **One site for the web app and the API.** The session cookie is `SameSite=Lax`, so it only works when both share a registrable domain. Platform domains (`onrender.com`, `netlify.app`, `vercel.app`, `pages.dev`) are on the Public Suffix List, so `app.onrender.com` and `api.onrender.com` are *different sites*, and sign-in breaks. That needs either one origin or a custom domain.

### Providers checked

| Provider | Free offer (verified 2026-11-17) | Kind of free | Fit for this app |
| --- | --- | --- | --- |
| **Oracle Cloud Always Free** | Ampere A1 VM: 2 OCPU / 12 GB RAM (1,500 OCPU-h, 9,000 GB-h per month; cut from 4/24 in June 2026), block storage, object storage; EU regions incl. Frankfurt and Serbia Central | Permanently free, **card required** for verification (no prepaid/virtual cards). Idle instances may be reclaimed (7 days with CPU, network and memory p95 under 20%) | **Runs the existing Docker stack unchanged**, always on, persistent disk |
| **MongoDB Atlas Free** (formerly M0) | 512 MB storage, 100 ops/s, 10 GB in/out per rolling 7 days, 500 connections, optional daily snapshot (4 kept); pauses after 30 days with zero connections | Permanently free, no card needed | **Fits** (replica set; the app's data is small). Transactions: replica set, so supported, but verify on the cluster (§5) |
| **Render Free** | Web service 512 MB / 0.1 CPU, 750 instance-h per month; **sleeps after 15 min** idle, ~1 min wake-up; **ephemeral filesystem, no disks**; "do not use for production"; may restart at any time | Permanently free, no card needed | Needs code changes (object storage, one origin or a domain) and gives slow cold starts |
| **Koyeb Free** | One web service, 512 MB / 0.1 vCPU, Frankfurt or Washington; scales to zero after 1 h idle | Permanently free | Same compromises as Render |
| **Cloudflare R2** | 10 GB-month storage, 1 M writes, 10 M reads, free egress; `r2.dev` URLs are rate-limited and "for development" only (production needs a custom domain on Cloudflare) | Permanently free tier; a payment method is reportedly asked for before the first bucket | Only if photos move to object storage |
| **Backblaze B2** | First 10 GB free; downloads free up to 3× stored data | Permanently free tier; card requirement reported differently | Good **off-site backup** target |
| **Fly.io** | No free tier for new accounts since 2024; a short trial (about $1 credit for 7 days) | Trial only | Not free |
| **Railway** | $5 credit for 30 days, then paid (Hobby $5/month minimum) | Trial only | Not free |
| **Google Cloud Run** | 2 M requests, 180,000 vCPU-s, 360,000 GiB-s per month; scales to zero; no persistent disk | Free tier, **billing account and card required**; overage is billed | Needs object storage and a domain: more moving parts than the problem deserves |
| **Hetzner Cloud CX23** | 2 vCPU / 4 GB / 40 GB, about €5.49/month + €0.50 IPv4, excl. VAT (prices raised in June 2026; availability varies) | Paid | Cheapest sensible paid fallback; existing stack unchanged |

### Complete architectures compared

| | **A. Completely free (recommended)** | **B. Free PaaS with compromises** | **C. Minimal paid** |
| --- | --- | --- | --- |
| Web + API | Oracle Always Free VM (Docker Compose, Caddy) | Render Free (one Docker web service) | Hetzner CX23 (Docker Compose, Caddy) |
| Database | Atlas Free (Frankfurt) | Atlas Free | Atlas Free (or MongoDB on the VM) |
| Photos | VM disk (Docker volume) | Cloudflare R2 (new storage code) | VM disk |
| Address and HTTPS | Free DuckDNS name (or own domain), Caddy + Let's Encrypt | Own domain needed (R2 production URL and same-site cookies) | Own domain, Caddy + Let's Encrypt |
| Backups | Atlas daily snapshots + nightly `mongodump` and photo archive to Backblaze B2 | Atlas snapshots; R2 has no backups of its own | As A |
| Monthly cost | **€0** (optionally ~€1/month for a domain) | ~€1/month for the domain; otherwise €0 | **~€6–7/month** (server + domain) |
| Code changes | **None** | S3-compatible `FileStorage` + a new dependency (`@aws-sdk/client-s3`); serve the SPA from Express or proxy `/api`; limit image jobs to 1 (512 MB RAM) | None |
| Always on | Yes | No: first request after 15 min idle waits ~1 min | Yes |
| What users notice | Nothing unusual | Slow first page or sign-in after quiet periods; photo uploads take several seconds on 0.1 CPU; rare restarts | Nothing unusual |
| Main risks | Oracle signup and A1 capacity; idle reclamation; one provider for the server | Memory limit during photo processing; in-memory rate limits reset on every sleep; the provider says not for production | Small cost |

### Recommendation: A, with C as the fallback

**Option A: an Oracle Always Free VM running the existing Docker Compose stack behind Caddy, with the database on Atlas Free and nightly off-site backups.**

- **It needs no application changes.** The Docker images, `FileStorage` on local disk, sessions, cookies and CORS all work as designed on one HTTPS origin.
- **It's always on with plenty of headroom.** 12 GB RAM and 2 cores, against the 0.1 CPU and 512 MB of the free PaaS tiers, which are tight for Argon2 and sharp.
- **Atlas holds the data**, so an Oracle problem can't take the database with it. Atlas also gives free daily snapshots, and the VM has no MongoDB to run, upgrade or back up.
- **The compromises you accept:**
  - you maintain a Linux VM (security updates, Docker);
  - Oracle needs a real credit card for verification;
  - A1 capacity in popular regions can be temporarily unavailable at signup;
  - Oracle may reclaim an instance it considers idle;
  - the free DuckDNS name is less professional than an own domain.

**Why not B:** it isn't actually simpler. It needs new storage code and a dependency. It needs either a paid domain or extra serving code. Users would wait about a minute after every quiet period. And the provider itself advises against production use.

**If Option A fails** (signup refused, no A1 capacity for weeks, or a reclaimed instance), **move to C, not B.** It's the same compose file and the same steps on a €6/month server.

## 2. Architecture (Option A)

```text
                          https://<name>.duckdns.org  (or your own domain)
Browser ──────────────▶ Oracle VM (Ubuntu, Docker Compose)
                         Caddy (TLS, HSTS, compression; ports 80/443)
                          ├─ /api/*, /uploads/* ──▶ api (Node 22, port 3333, internal network only)
                          └─ everything else    ──▶ web (nginx, static Vite build)
                         api ──▶ uploads volume (photos, on the VM's block volume)
                         api ──TLS──▶ MongoDB Atlas Free (Frankfurt; only the VM's IP allowed)
                         cron ──▶ nightly backup ──▶ Backblaze B2 (off-site)
```

- **One origin**, so the session cookie is first-party, `SameSite=Lax` works, and `CORS_ORIGIN` is the site URL. The web app calls the API at the relative path `/api` (`VITE_API_URL=/api`), so the web image doesn't depend on the domain.
- **One API instance**, which is what the in-memory rate limits and local photo storage assume.
- **The files:** [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`Caddyfile`](../Caddyfile) and [`.env.production.example`](../.env.production.example) in the repository root (§4).
- **ARM64 (Ampere):** the images are built on the VM itself. The base images (`node:22-bookworm-slim`, `nginx:1.27-alpine`, `caddy:2`, and `mongo:8` for backup tools) publish `arm64` variants. Every native dependency has a `linux-arm64` glibc build: the lockfile has `@img/sharp-linux-arm64`, `@nx/nx-linux-arm64-gnu`, `@rolldown/binding-linux-arm64-gnu`, `@esbuild/linux-arm64`, `@tailwindcss/oxide-linux-arm64-gnu`, `lightningcss-linux-arm64-gnu` and `@swc/core-linux-arm64-gnu`, and `argon2` 0.45.1 bundles `prebuilds/linux-arm64/argon2.armv8.glibc.node`. The first build on the VM is what proves it (§6, step 7).

Services and accounts needed: Oracle Cloud, MongoDB Atlas, DuckDNS (or a domain registrar), Backblaze B2, and an uptime monitor (any free one, e.g. UptimeRobot).

## 3. Free-tier limits and what they mean here

| Limit | Effect on this app |
| --- | --- |
| Atlas Free: 512 MB | Users, pets, applications and messages are small (KBs per record). Sessions expire after 7 days (TTL). Photos are not in the database. Hundreds of active users fit. Watch "Data Size" in Atlas; upgrade path in §9. |
| Atlas Free: 100 ops/s, 10 GB transfer per 7 days | Far above a small site's traffic. Pages are paginated (12–50 items). |
| Atlas Free: paused after 30 days with zero connections | The running API keeps a connection open, so it doesn't pause. A stopped VM for a month would pause it; resume it in the Atlas UI. |
| Atlas Free: snapshots daily, 4 kept | The nightly `mongodump` (§8) is the longer-term, portable copy. |
| Oracle: idle reclamation (7 days below 20% CPU, network and memory) | A quiet site can look idle. Watch Oracle's emails; keep backups current, because recovery means a new VM and the steps in §6. Upgrading the account to Pay As You Go keeps Always Free resources at no charge and is widely reported to stop idle reclamation, but Oracle's docs don't say so; it also puts a card on an account that could then be billed for anything outside the free limits. Don't run fake-load scripts to dodge the rule. |
| Oracle: home region is permanent; A1 only in it | Choose an EU region at signup: Frankfurt, Milan or Zurich (good latency from Serbia), or Serbia Central (Jovanovac) if it's offered for Always Free; it has one availability domain. |
| Backblaze B2: 10 GB free | Photos are re-encoded (≤ 2000 px, usually well under 1 MB) and database dumps are small, so 7 days of copies fit for a long time. |

## 4. Production configuration

Prepared in the repository root (2026-11-17); checked locally (§5), **not yet run on a server**:

| File | Purpose |
| --- | --- |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | `caddy`, `api` and `web` on one internal network; no MongoDB service (Atlas). Only Caddy publishes ports (80, 443 TCP and UDP). Restart `unless-stopped`, health checks on `api` and `web`, log rotation (10 MB × 5) on every service, named volumes for photos and certificates. |
| [`Caddyfile`](../Caddyfile) | HTTPS for `SITE_DOMAIN` (Let's Encrypt), HSTS, compression; `/api/*` and `/uploads/*` to the API (30 MB body limit), everything else to the web app with CSP, `nosniff`, `Referrer-Policy` and `Permissions-Policy`. No access log, so client IPs and query strings aren't logged. |
| [`.env.production.example`](../.env.production.example) | Placeholders for the values that differ per deployment. Copied to `.env.production` on the server. |

Start, stop and inspect it with `--env-file`, which feeds `.env.production` into the compose file:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
```

Never run `down -v`: it deletes the photo volume. `docker compose ... config` prints the secrets, so don't paste its output anywhere.

### Where each setting lives

| Setting | Configured in |
| --- | --- |
| `SITE_DOMAIN`, `ACME_EMAIL`, `MONGODB_URI`, `SESSION_SECRET`, `AUDIT_HMAC_KEY`, `LOG_LEVEL` | `/opt/pet-adoption/.env.production` on the VM (`chmod 600`), plus the secrets in your password manager. Ignored by Git and by the Docker build context. Compose refuses to start while a required value is empty. |
| `NODE_ENV`, `HOST`, `PORT`, `TRUST_PROXY`, `CORS_ORIGIN`, `UPLOADS_DIR`, `UPLOADS_BASE_URL` | Fixed in `docker-compose.prod.yml`; the URLs are built from `SITE_DOMAIN`, so they can't disagree with each other. |
| `VITE_API_URL` | `/api`, the web build arg in the compose file. |
| TLS, security headers, body size limit | `Caddyfile`. |
| DNS record | DuckDNS (or the registrar): `SITE_DOMAIN` → the VM's public IP. |
| Database user, IP allowlist, snapshots | Atlas UI. |
| Firewall | Oracle VCN security list **and** the VM's own firewall (Oracle's Ubuntu images ship restrictive `iptables` rules). |
| Backup credentials | `rclone` configuration on the VM (§8). |

### API environment as the compose file sets it

Validated at startup (`apps/api/src/config/env.ts`); the API refuses to start on a missing or invalid value.

| Variable | Value | Secret | Why |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | | `Secure` session cookie; makes `TRUST_PROXY` required. |
| `HOST` / `PORT` | `0.0.0.0` / `3333` | | Inside the container; not published. |
| `TRUST_PROXY` | `1` | | Exactly one proxy (Caddy), and nothing else can reach the API. Caddy sets `X-Forwarded-For` to the real client IP and `X-Forwarded-Proto: https`. |
| `CORS_ORIGIN` | `https://${SITE_DOMAIN}` | | The site's origin; also the CSRF `Origin` check. |
| `UPLOADS_DIR` | `/app/uploads` | | The `pet-adoption-prod_uploads_data` volume. |
| `UPLOADS_BASE_URL` | `https://${SITE_DOMAIN}/uploads` | | Photo URLs in API responses. (The code's default is an `http://` URL, which is why the compose file always sets it.) |
| `MONGODB_URI` | from `.env.production` | **yes** | Atlas SRV string with the database name in the path. |
| `SESSION_SECRET` | from `.env.production` | **yes** | 32+ characters. |
| `AUDIT_HMAC_KEY` | from `.env.production` | **yes** | Optional in the code; required by the production compose file. |
| `LOG_LEVEL` | from `.env.production`, default `info` | | |

**Values with `$`:** Compose interpolates `.env.production`, so a `$` in a value breaks it. Use letters and digits for the Atlas password (Atlas's "Autogenerate" does) and the base64url secrets from the generator command.

### How it fits the application

- **Cookies:** the API sees `X-Forwarded-Proto: https` from Caddy, Express (`trust proxy` 1) marks the request secure, and express-session sends `sid` with `HttpOnly; Secure; SameSite=Lax`. If the proxy settings were wrong, express-session would **silently not send the cookie**: registration and sign-in return success, but the user isn't signed in. The smoke test checks the cookie for this reason.
- **CORS and CSRF:** browser requests come from `https://${SITE_DOMAIN}` to the same origin, so `Origin` matches `CORS_ORIGIN`; any other `Origin` on a change gets 403 `UNTRUSTED_ORIGIN`.
- **Photos:** the API stores files in the volume and returns `https://${SITE_DOMAIN}/uploads/pets/<random>.<ext>`; Caddy routes `/uploads/*` to the API, which serves them with `nosniff` and long-term caching. The image creates `/app/uploads` owned by the `node` user, and a new named volume copies that ownership, as in Docker QA.
- **Atlas:** `mongodb+srv` uses TLS and DNS SRV lookups (Docker's default DNS is enough). The API checks at startup that the server is a replica set; Atlas clusters are.
- **Shutdown:** `docker compose stop` sends SIGTERM to `node main.js` (PID 1, with its own handlers): the server stops accepting connections, Node 22 closes idle keep-alive connections, then the database connection closes. `stop_grace_period` is 20 s before Docker kills it.
- **Startup failures** (Atlas unreachable, a bad setting) exit the API with a logged reason; `restart: unless-stopped` retries with Docker's back-off, and Caddy answers 502 for `/api` meanwhile.
- **CSP:** the built app has no inline scripts and uses no `eval`. Inline `<style>` tags (the toast library, React) need `style-src 'unsafe-inline'`. zod probes for `eval` support with `Function('')` inside a try/catch; the CSP blocks it, the browser logs one CSP warning, and zod falls back to its normal mode. Don't add `'unsafe-eval'` for it.

## 5. Status: prepared, verified locally, still to verify

| | Status |
| --- | --- |
| Configuration files | **Prepared** (§4). |
| `docker compose config` | **Verified locally:** with test values it resolves `NODE_ENV=production`, `TRUST_PROXY=1`, the `https://` origin and photo URL, `VITE_API_URL=/api`, ports only on Caddy, and log rotation, restart policies and volumes on every service. With `.env.production.example` as is (empty secrets) it refuses to start. |
| Production behaviour of the API | **Verified locally** (2026-11-17) by running the built bundle (`apps/api/dist/main.js`) with `NODE_ENV=production`, `TRUST_PROXY=1` and an `https://` origin against a throwaway in-memory replica set, with requests carrying the headers Caddy adds. 16/16 checks passed: refuses to start without `TRUST_PROXY`; `/api/ready` 200; `sid` is `HttpOnly; Secure; SameSite=Lax`, and missing without `X-Forwarded-Proto`; a foreign `Origin` gets 403; a photo upload is re-encoded into `UPLOADS_DIR` and returned as `https://<site>/uploads/pets/…`, then served with `nosniff`; apply + accept (transactions) adopts the pet; rate limits key on the forwarded client IP; logs are JSON with request ids and contain no emails, passwords, cookies, messages or IPs. |
| Web bundle against the CSP | **Checked locally** by reading the built `index.html` and bundle (no inline scripts, no `eval`); not yet loaded in a browser under the CSP. |
| ARM64 | **Checked in the lockfile and packages** (§2), not built: Docker wasn't available locally, and the real build happens on the VM. |
| `Caddyfile` syntax | **Reviewed by hand only.** Validate on the VM before the first start: `docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" -e SITE_DOMAIN=example.com -e ACME_EMAIL=a@example.com caddy:2 caddy validate --config /etc/caddy/Caddyfile`. |
| Containers running together, certificates, real proxy headers, Atlas (TLS, SRV, transactions on the Free tier), shutdown timing, the CSP in a browser | **Not yet verified:** needs the VM and the Atlas cluster (§6 and the smoke test in §7). |
| Backups | **Procedure documented** (§8); not configured or tested. |

## 6. First deployment, step by step

These are manual steps: accounts, payment details and DNS are yours to set up. Commands run on the VM in `/opt/pet-adoption` unless noted. `dc` below is short for `docker compose --env-file .env.production -f docker-compose.prod.yml`.

1. **Code ready:** the blockers in [production-readiness.md](production-readiness.md) §2 are done, CI is green on `develop`, `develop` is merged into `master`, and the release is tagged (`v1.0.0`).
2. **Atlas:** create an account and a Free cluster in Frankfurt (AWS `eu-central-1`, or the nearest EU region offered). Create a database user `pet-adoption-api` with `readWrite` on `pet-adoption` only, with an autogenerated (letters and digits) password. Turn on the Free cluster's daily snapshots. Leave Network Access empty until the VM's IP is known.
3. **Oracle:** sign up (real credit card, accurate details, no VPN), choosing an EU home region (§3). Create an instance: shape `VM.Standard.A1.Flex` (2 OCPU, 12 GB), Ubuntu 24.04, your SSH public key, a public IP. If A1 capacity is unavailable, retry later or try another availability domain.
4. **Server basics:** in the VCN security list, allow inbound TCP 80 and 443, plus UDP 443 for HTTP/3 (22 is open by default; restrict it to your IP if you can). On the VM, open the same ports in its own firewall; Oracle's Ubuntu images ship `iptables` rules that block them. Disable SSH password login; enable `unattended-upgrades`. Install Docker Engine with the Compose plugin, and `rclone` for backups.
5. **Address:** at DuckDNS, create `<name>.duckdns.org` pointing at the VM's public IP (or an `A` record at your registrar). In Atlas → Network Access, allow the VM's public IP only.
6. **Files:** `git clone` the repository at the tag into `/opt/pet-adoption`, then `cp .env.production.example .env.production`, fill it in (§4), and `chmod 600 .env.production`.
7. **Check, build and start:**

   ```sh
   docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" --env-file .env.production caddy:2 caddy validate --config /etc/caddy/Caddyfile
   dc config --quiet          # fails if a required value is missing
   dc up -d --build           # first build: several minutes, on the VM's ARM CPU
   dc ps                      # api and web "healthy", caddy "running"
   dc logs api                # "database connected", "listening"
   dc logs caddy              # "certificate obtained successfully"
   ```

   If the API exits at startup, its log names the setting or module that failed (e.g. a native module that didn't load on ARM, or Atlas refusing the IP).
8. **Indexes:** Mongoose creates them at startup. In Atlas → Collections → each collection → Indexes, confirm `users` has a unique `email` index and `adoptionapplications` two unique partial indexes (they back the adoption rules).
9. **First admin:** register in the app, then run the CLI from the API image's build stage (it has the workspace and `tsx`):

   ```sh
   docker build --target build -t pet-adoption-tools -f apps/api/Dockerfile .
   docker run --rm --env-file .env.production pet-adoption-tools pnpm admin:grant you@example.com        # dry run: check the database line
   docker run --rm --env-file .env.production pet-adoption-tools pnpm admin:grant you@example.com --yes
   ```

   The same image runs `pnpm audit:verify`. **Never** run `pnpm dev:seed` or `qa:seed` against production: the demo password is public.
10. **Smoke test** (§7).
11. **Backups:** set up the nightly backup and do one restore drill (§8) before announcing the site.
12. **Monitoring:** an uptime check on `https://<name>.duckdns.org/api/ready` with email alerts.

## 7. Health checks and smoke test

- `GET /api/health`: liveness; the Compose health check of `api` (every 30 s).
- `GET /api/ready`: 200 when MongoDB answers a ping within 2 s, else 503 `DATABASE_UNAVAILABLE` (logged as `database not ready` with the reason); for the uptime monitor.
- The `web` health check fetches `/` from nginx.

After every deployment:

- `/api/health` and `/api/ready` return `{"status":"ok"}`; `http://` redirects to `https://`; the certificate is valid.
- Register a test account. In DevTools → Application → Cookies, `sid` is `HttpOnly`, `Secure`, `SameSite=Lax`. Reload: still signed in. **If registration succeeds but you're not signed in, the cookie wasn't sent: check `TRUST_PROXY` and Caddy's headers before anything else.** Sign out and in again.
- Response headers in DevTools: pages have the CSP, HSTS and `nosniff`; `/api` responses have `X-Request-Id`.
- Create a pet with a photo; the photo loads from `https://<site>/uploads/pets/…` with no mixed-content warning. Edit it.
- With a second account, apply and message the owner; as the owner, **accept**. This runs a multi-document transaction on Atlas Free; a failure would be a 500 with `unexpected error` in the log. The pet shows as adopted.
- `dc logs api` has `request completed` lines and no `unexpected error`. The browser console has no errors except one CSP warning from zod's `eval` probe (§4).
- `dc restart api`: the log has `shutting down`, `HTTP server closed` and `database disconnected (shutdown)` before the new `starting`, and photos still load (the volume persists).
- Delete the test pets. Test accounts can't be deleted yet, so use addresses you control.

## 8. Backups and recovery

**Status: a procedure, not yet configured or tested.** Don't consider backups working until the restore drill below has succeeded.

What must be recoverable: the **database** (Atlas) and the **photos** (the `pet-adoption-prod_uploads_data` volume; the database stores only their keys). Secrets live in the password manager, not in backups.

### Layers

1. **Atlas snapshots:** daily, last 4 kept (Atlas → cluster → Backup). The quickest way back after a recent mistake; restore from the Atlas UI.
2. **Nightly copies off both providers:** a database dump and a photo archive, uploaded to Backblaze B2, so losing the VM, the Oracle account or the Atlas cluster loses at most a day.

### Setup (once)

1. In Backblaze B2: a **private** bucket (e.g. `pet-adoption-backups`), and an application key restricted to that bucket. Add a lifecycle rule that deletes files after 30 days.
2. On the VM: `rclone config` → a remote named `b2` of type Backblaze B2 with that key.
3. A script, `/opt/pet-adoption/backup.sh` (`chmod 700`):

   ```sh
   #!/bin/sh
   set -eu
   cd /opt/pet-adoption
   day=$(date +%F)
   mkdir -p backups
   # Database: mongodump from the official image (arm64), reading MONGODB_URI from the env file.
   docker run --rm --env-file .env.production mongo:8 \
     sh -c 'mongodump --uri "$MONGODB_URI" --archive --gzip' > "backups/db-$day.archive.gz"
   # Photos: read-only mount of the volume.
   docker run --rm -v pet-adoption-prod_uploads_data:/data:ro -v "$PWD/backups:/backup" alpine \
     tar czf "/backup/uploads-$day.tar.gz" -C /data .
   rclone copy backups/ b2:pet-adoption-backups/
   find backups -type f -mtime +3 -delete
   ```

4. `crontab -e`: `30 3 * * * /opt/pet-adoption/backup.sh >> /var/log/pet-adoption-backup.log 2>&1`.
5. Run it once by hand and check that both files appear in the B2 bucket with a plausible size.

Notes: on Atlas Free, `mongodump` works for application databases (it can't dump `admin` or use `--oplog`, which this app doesn't need). The dump contains users' personal data and password hashes, so the bucket must stay private and the key restricted. Run the database part by hand **before every deployment**.

### Restore drill (before launch, then every few months)

It proves the backups are usable without touching production:

1. Download the latest pair from B2: `rclone copy b2:pet-adoption-backups/db-<day>.archive.gz backups/restore/` (and the `uploads-<day>.tar.gz`).
2. Restore the database into a **scratch database on the same cluster** (the data is small):

   ```sh
   docker run --rm --env-file .env.production -v "$PWD/backups/restore:/r" mongo:8 sh -c \
     'uri=$(echo "$MONGODB_URI" | sed "s#/pet-adoption?#/?#"); mongorestore --uri "$uri" --archive=/r/db-<day>.archive.gz --gzip --nsFrom "pet-adoption.*" --nsTo "restore-test.*"'
   ```

   The database name is removed from the URI so it doesn't override the `--nsTo` target; the dump in `backup.sh` keeps it, which limits the dump to `pet-adoption`.

   The Atlas user needs `readWrite` on `restore-test` too, for the drill only.
3. Unpack the photos into a scratch volume: `docker volume create restore-test-uploads`, then `docker run --rm -v restore-test-uploads:/data -v "$PWD/backups/restore:/r" alpine tar xzf /r/uploads-<day>.tar.gz -C /data`.
4. Check: document counts per collection in `restore-test` match `pet-adoption` (Atlas → Collections), and every photo key in `restore-test.pets` (`images.key`) exists as a file in the scratch volume.
5. Clean up: drop the `restore-test` database in Atlas, remove the drill's `readWrite` grant, and `docker volume rm restore-test-uploads` (that scratch volume only). Note how long it took.

### Real recovery

- **A recent mistake in the data:** restore an Atlas snapshot (Atlas UI), or `mongorestore --drop` the latest dump into `pet-adoption` (stop the API first: `dc stop api`; use the URI without the database path, as in the drill).
- **Lost photos:** `dc stop api`, unpack the archive into `pet-adoption-prod_uploads_data` as in drill step 3 (files keep their owner, uid 1000 = `node`), then `dc start api`.
- **Lost VM or Oracle account:** a new VM (Oracle again, or Hetzner per §9), §6 steps 3–7, restore the photos, point DNS at the new IP. The database stays on Atlas.
- **Data loss window:** up to a day.

## 9. Migration path when the free tier isn't enough

| Trigger | Move |
| --- | --- |
| Oracle refuses signup, has no capacity, or reclaims or terminates the VM | Same compose file on Hetzner CX23 (~€6/month): §6 steps 4–12, restore the photo archive. Atlas stays as is. |
| Database approaching 512 MB | Atlas Flex (~$8/month base, capped at $30) with Atlas's upgrade, or MongoDB in the compose stack on the VM (restore a dump; add it to the nightly backup). |
| A real domain wanted | Register one (~€10–15/year), point it at the VM, then change `CORS_ORIGIN`, `UPLOADS_BASE_URL`, `VITE_API_URL` (rebuild the web image) and the `Caddyfile`. Photo URLs follow automatically (only keys are stored); users sign in again once. |
| More than one API instance needed | Not before real growth: needs a shared rate-limit store (Redis/MongoDB) and object storage for photos. |

## 10. Reference

### Same-site cookies

The session cookie is `HttpOnly`, `SameSite=Lax`, 7 days, `Secure` with `NODE_ENV=production`. It works with one origin (`/api` behind a proxy, as here) or with subdomains of one registrable domain you control (`app.example.com` + `api.example.com`). It does **not** work across platform domains on the Public Suffix List (`*.onrender.com`, `*.netlify.app`, `*.vercel.app`, `*.pages.dev`), even between two subdomains of the same platform; that would need `SameSite=None; Secure` plus CSRF tokens, which the code doesn't have.

### `TRUST_PROXY`

Express's `trust proxy` (`apps/api/src/config/trust-proxy.ts`), validated at startup and required in production. It decides the client IP (per-IP rate limits) and whether the request was HTTPS (`Secure` cookies).

- `false`: no proxy (local development, Docker QA).
- A hop count `1`–`10`: trust that many proxies. Safe only if clients **cannot reach the API except through them**.
- A list of proxy addresses (`loopback`, `10.0.0.5`, `172.18.0.0/16`, `uniquelocal`): only those are trusted.
- Refused: `true`, `0`, `0.0.0.0/0`, `::/0`, malformed values.

Each trusted proxy must set `X-Forwarded-Proto` and set or append `X-Forwarded-For` (Caddy does both by default).

### CORS and CSRF

`CORS_ORIGIN` is the one allowed origin. The same value drives the CSRF check: state-changing requests with a different `Origin` get 403 `UNTRUSTED_ORIGIN`.

### Logs

- One JSON object per line on stdout (`apps/api/src/logging/logger.ts`); read with `docker compose logs api`. No central log storage, alerting or error tracking yet.
- Logged: startup and shutdown, one `request completed` line per request (request id, method, path without query string, status, duration, `userId` when signed in), `unexpected error` with the stack for every 500, database connection changes, failed photo deletions.
- Never logged: bodies, query strings, headers and cookies, emails, names, client IPs. Error messages are scrubbed of URL credentials (such as the Atlas password) and duplicate-key values.
- Every response has an `X-Request-Id` header; search the logs for it to find a failure.

### Photos

Stored under `UPLOADS_DIR` (a persistent volume). Every upload is decoded and re-encoded with sharp (no metadata, rotation applied, ≤ 2000 px); the uploaded bytes are never stored. Start production with an empty uploads volume; never copy development or QA uploads into it. Limits: 5 MB per file, 5 files per request, 5 photos per pet, at most 2 images processed at once. A host without persistent disk needs an object-storage implementation of `FileStorage` (`apps/api/src/storage/`) and the provider's SDK as a new dependency.

### Rate limits and several instances

All rate-limit counters are in the API process's memory: correct for one instance, reset on restart.

### Admin audit log

`pnpm audit:verify` checks the hash chain. To detect someone with database access deleting the newest entries, run it on a schedule and keep a copy of the chain head (`auditchainheads`: last `seq` and `hash`) outside the database.

### Rollback

- Code: `git checkout <previous tag>` and `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`.
- Data: there are no migrations; the startup data fixes (`backfillApplicationPetOwners`, `backfillPetImages`) are idempotent and only add data, so the previous release runs on the same database. If a release damaged data, restore the dump taken before it, or an Atlas snapshot.

## 11. Sources (checked 2026-11-17)

- Render Free: <https://render.com/docs/free>, regions <https://render.com/docs/regions>, pricing <https://render.com/pricing>
- MongoDB Atlas Free limits: <https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/>; Flex pricing: <https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/>
- Oracle Always Free resources: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>; Free Tier FAQ (cards): <https://www.oracle.com/cloud/free/faq/>; A1 allocation change: <https://community.oracle.com/customerconnect/discussion/970310/oci-always-free-updated-ampere-a1-compute-allocation>; Serbia Central region: <https://docs.oracle.com/iaas/releasenotes/changes/dda8f9c9-90a8-4214-8fdb-5bd169be0eed>
- Cloudflare R2 pricing: <https://developers.cloudflare.com/r2/pricing/>; `r2.dev` limits: <https://developers.cloudflare.com/r2/buckets/public-buckets/>
- Backblaze B2 pricing: <https://www.backblaze.com/cloud-storage/pricing>
- Koyeb free instance: <https://www.koyeb.com/docs/faqs/pricing>
- Google Cloud Run pricing: <https://cloud.google.com/run/pricing>
- Fly.io and Railway: no permanent free tier for new accounts (provider pricing pages; third-party trackers such as <https://www.saaspricepulse.com/tools/flyio> and <https://www.saaspricepulse.com/tools/railway> agree)
- Hetzner price adjustment (June 2026): <https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/>
- Public Suffix List and platform cookies: <https://publicsuffix.org/learn/>, <https://community.render.com/t/setting-cookies-onrender-com/7886>
