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

- **One origin**, so the session cookie is first-party, `SameSite=Lax` works, and `CORS_ORIGIN` is the site URL.
- **One API instance**, which is what the in-memory rate limits and local photo storage assume.
- The VM is ARM (Ampere). The base images (`node:22-bookworm-slim`, `nginx`, `caddy`) are multi-architecture, and `sharp` and `argon2` ship prebuilt `linux-arm64` binaries. Confirm on the first build (step 7 in §6).

Services and accounts needed: Oracle Cloud, MongoDB Atlas, DuckDNS (or a domain registrar), Backblaze B2, and an uptime monitor (any free one, e.g. UptimeRobot).

## 3. Free-tier limits and what they mean here

| Limit | Effect on this app |
| --- | --- |
| Atlas Free: 512 MB | Users, pets, applications and messages are small (KBs per record). Sessions expire after 7 days (TTL). Photos are not in the database. Hundreds of active users fit. Watch "Data Size" in Atlas; upgrade path in §9. |
| Atlas Free: 100 ops/s, 10 GB transfer per 7 days | Far above a small site's traffic. Pages are paginated (12–50 items). |
| Atlas Free: paused after 30 days with zero connections | The running API keeps a connection open, so it doesn't pause. A stopped VM for a month would pause it; resume it in the Atlas UI. |
| Atlas Free: snapshots daily, 4 kept | The nightly `mongodump` (§7) is the longer-term, portable copy. |
| Oracle: idle reclamation (7 days below 20% CPU, network and memory) | A quiet site can look idle. Watch Oracle's emails; keep backups current, because recovery means a new VM and the steps in §6. Upgrading the account to Pay As You Go keeps Always Free resources at no charge and is widely reported to stop idle reclamation, but Oracle's docs don't say so; it also puts a card on an account that could then be billed for anything outside the free limits. Don't run fake-load scripts to dodge the rule. |
| Oracle: home region is permanent; A1 only in it | Choose an EU region at signup: Frankfurt, Milan or Zurich (good latency from Serbia), or Serbia Central (Jovanovac) if it's offered for Always Free; it has one availability domain. |
| Backblaze B2: 10 GB free | Photos are re-encoded (≤ 2000 px, usually well under 1 MB) and database dumps are small, so 7 days of copies fit for a long time. |

## 4. Production configuration

### Where each setting lives

| Setting | Configured in |
| --- | --- |
| API environment (below) | `/opt/pet-adoption/.env.production` on the VM (`chmod 600`), plus a copy of the secrets in your password manager. Never in Git. |
| `VITE_API_URL` | Web image build arg in the production compose file |
| Domain, TLS, security headers | `Caddyfile` on the VM; DNS record at DuckDNS or the registrar |
| Database user, password, IP allowlist, snapshots | Atlas UI |
| Firewall | Oracle VCN security list **and** the VM's own firewall (Oracle's Ubuntu images ship restrictive `iptables` rules) |
| Backup credentials | B2 application key in the backup script's `rclone` config on the VM |

### API environment

Validated at startup (`apps/api/src/config/env.ts`); the API refuses to start on a missing or invalid value.

| Variable | Production value | Secret | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | | `Secure` session cookie; makes `TRUST_PROXY` required. |
| `HOST` / `PORT` | `0.0.0.0` / `3333` | | Inside the container. Don't publish the port on the host. |
| `MONGODB_URI` | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/pet-adoption?retryWrites=true&w=majority` | **yes** | From Atlas "Connect → Drivers". The user should have `readWrite` on `pet-adoption` only. |
| `SESSION_SECRET` | 32+ random characters | **yes** | Changing it signs everyone out. |
| `CORS_ORIGIN` | `https://<name>.duckdns.org` | | Exact origin of the site; also the CSRF `Origin` check. |
| `TRUST_PROXY` | `1` | | One proxy (Caddy). Safe only because the API port is reachable from Caddy alone. |
| `UPLOADS_DIR` | `/app/uploads` | | A named volume. |
| `UPLOADS_BASE_URL` | `https://<name>.duckdns.org/uploads` | | **Must be set**: the default is an `http://` URL. |
| `LOG_LEVEL` | `info` | | |
| `AUDIT_HMAC_KEY` | 32+ random characters | **yes** | Signs the admin audit log. Never change it. |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

### Compose file

Start from `docker-compose.qa.yml` and change:

- **remove the `mongodb` service** and `depends_on: mongodb`; the database is Atlas;
- `env_file: .env.production` for the API instead of inline values;
- no `ports:` on `api` or `web`; only a new `caddy` service (`caddy:2`) publishes 80 and 443, with volumes for `/data` and `/config` (certificates) and the `Caddyfile`;
- web build arg `VITE_API_URL: https://<name>.duckdns.org/api`;
- keep the `uploads_data` volume and the health checks;
- log rotation on every service, otherwise logs grow until the disk is full:

  ```yaml
  logging:
    driver: json-file
    options: { max-size: 10m, max-file: '5' }
  ```

- drop the QA-only parts (`x-no-host-access`, the QA names that `qa-config.ts` checks).

### Caddyfile (starting point, not yet tested)

```caddyfile
<name>.duckdns.org {
  encode zstd gzip
  header Strict-Transport-Security "max-age=31536000"

  @api path /api/* /uploads/*
  handle @api {
    request_body { max_size 30MB }
    reverse_proxy api:3333
  }

  handle {
    header {
      Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      X-Content-Type-Options nosniff
      Referrer-Policy strict-origin-when-cross-origin
    }
    reverse_proxy web:80
  }
}
```

Caddy gets and renews the certificate itself and sets `X-Forwarded-For` / `X-Forwarded-Proto`, which the API needs for `Secure` cookies and client IPs. The API adds its own headers (helmet). Check the CSP in the browser console on the first deploy.

## 5. What is verified, and what to verify on the real stack

- **Unchanged and tested:** sessions, cookies, CORS/CSRF, uploads, rate limits and logging (API, web and E2E suites). The Docker images are the ones Docker QA runs.
- **Verify on the first deployment:**
  - transactions on Atlas Free: accepting an application (smoke test) runs a multi-document transaction; a failure would show as a 500 with a transaction error in the log;
  - the `Secure` cookie and HTTPS detection behind Caddy;
  - the ARM build (`sharp`, `argon2` load at startup; a photo upload works);
  - the CSP.

## 6. First deployment, step by step

These are manual steps: accounts, payment details and DNS are yours to set up.

1. **Code ready:** the blockers in [production-readiness.md](production-readiness.md) §2 are done, CI is green on `develop`, `develop` is merged into `master`, and the release is tagged (`v1.0.0`).
2. **Atlas:** create an account and a Free cluster in Frankfurt (AWS `eu-central-1`, or the nearest EU region offered). Create a database user with `readWrite` on `pet-adoption` and a long generated password. Turn on the Free cluster's daily snapshots. Leave Network Access empty until the VM's IP is known.
3. **Oracle:** sign up (real credit card, accurate details, no VPN), choosing an EU home region (§3). Create an instance: shape `VM.Standard.A1.Flex` (2 OCPU, 12 GB), Ubuntu 24.04, your SSH public key, a public IP. If A1 capacity is unavailable, retry later or try another availability domain.
4. **Network:** in the VCN security list, allow inbound TCP 80 and 443 (22 is open by default; restrict it to your IP if you can). On the VM, open 80/443 in its own firewall as well. Disable SSH password login; enable automatic security updates (`unattended-upgrades`). Install Docker Engine with the Compose plugin.
5. **Address:** at DuckDNS, sign in and create `<name>.duckdns.org` pointing at the VM's public IP (or add an `A` record at your registrar). In Atlas → Network Access, allow the VM's public IP only.
6. **Files:** clone the repository at the tag into `/opt/pet-adoption`; add `docker-compose.prod.yml`, `Caddyfile` and `.env.production` (§4).
7. **Build and start:** `docker compose -f docker-compose.prod.yml up -d --build` (the first build takes several minutes). `docker compose -f docker-compose.prod.yml ps` shows all services healthy; the API log has `database connected` and `listening`. If the API exits at startup, the log names the setting or module that failed.
8. **Indexes:** Mongoose creates them at startup. In Atlas → Collections → each collection → Indexes, confirm `users` has a unique `email` index and `adoptionapplications` two unique partial indexes (they back the adoption rules).
9. **First admin:** register in the app, then run the CLI from the API image's build stage (it has the workspace and `tsx`):

   ```sh
   docker build --target build -t pet-adoption-tools -f apps/api/Dockerfile .
   docker run --rm --env-file .env.production pet-adoption-tools pnpm admin:grant you@example.com   # dry run: check the database line
   # then the same with --yes
   ```

   The same image runs `pnpm audit:verify`. **Never** run `pnpm dev:seed` or `qa:seed` against production: the demo password is public.
10. **Smoke test** (§7).
11. **Backups:** set up the nightly backup and do one restore drill (§8) before announcing the site.
12. **Monitoring:** an uptime check on `https://<name>.duckdns.org/api/ready` with email alerts.

## 7. Health checks and smoke test

- `GET /api/health`: liveness; used by the Compose health check to restart the container.
- `GET /api/ready`: 200 when MongoDB answers a ping within 2 s, else 503 `DATABASE_UNAVAILABLE`; used by the uptime monitor.

After every deployment:

- `/api/health` and `/api/ready` return `{"status":"ok"}`; `http://` redirects to `https://`; the certificate is valid.
- Register a test account: the `sid` cookie is `HttpOnly; Secure; SameSite=Lax` (DevTools → Application → Cookies). Sign out and in again.
- Create a pet with a photo; the photo loads from `https://…/uploads/…` with no mixed-content warning. Edit it.
- With a second account, apply and message the owner; as the owner, **accept** (this exercises a transaction). The pet shows as adopted.
- The API log (`docker compose -f docker-compose.prod.yml logs api`) has `request completed` lines and no `unexpected error`; the browser console has no CSP errors.
- Delete the test pets. Test accounts can't be deleted yet, so use addresses you control.

## 8. Backups and recovery

What must be recoverable: the **database** (Atlas) and the **photos** (the VM's uploads volume; the database stores only their keys). Secrets live in the password manager, not in backups.

- **Atlas snapshots:** daily, last 4 kept (Atlas UI → Backup). The fastest restore after a recent mistake.
- **Nightly script on the VM** (cron), kept off Oracle so losing the VM or the account loses nothing:
  - `docker run --rm mongo:8 mongodump --uri "$MONGODB_URI" --archive --gzip > backups/db-$(date +%F).archive.gz` (on Atlas Free, `mongodump` works for application databases; it can't dump `admin` or use `--oplog`, which this app doesn't need);
  - `tar czf backups/uploads-$(date +%F).tar.gz -C <uploads volume path> .`;
  - `rclone copy backups/ b2:<bucket>/` with a B2 key limited to that bucket; keep 7 daily and 4 weekly copies; delete local copies older than 3 days.
- **Before every deployment:** run the same database dump.
- **Restore drill** (once before launch, then occasionally): restore the latest dump into a scratch database (`mongorestore --uri <scratch> --archive --gzip`), unpack the photos into a scratch volume, start the API against both, and open a few pets with photos. Note how long it took.
- **Losing the VM:** create a new one (§6, steps 3–7), restore the photo archive into the uploads volume, and point DNS at the new IP. The database is untouched on Atlas.
- **Data loss window:** up to a day for photos and dumps; Atlas snapshots are daily too.

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

- Code: `git checkout <previous tag>` and `docker compose -f docker-compose.prod.yml up -d --build`.
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
