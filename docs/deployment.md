# Deployment

Two deployment paths share the same API image:

- **Live demo (managed free tiers, in use since 2026-11-18):** the next section. Topology and proxy: [architecture.md](architecture.md) §6 "Hosted demo". Every setting, without real values: [`.env.render.example`](../.env.render.example).
- **Self-hosted reference (one VM with Docker Compose and Caddy):** §1 to §12. Prepared and verified locally, not used, because the Oracle VM needs a card.

What still blocks real users is in [production-readiness.md](production-readiness.md); the current status is in [progress.md](progress.md).

## Live demo (managed hosting)

Cloudflare Pages serves the web app and forwards `/api` through a Pages Function to the API on Render Free (Docker, `apps/api/Dockerfile`, health check `/api/health`); data is in MongoDB Atlas Free, photos in Cloudinary. Secrets exist only in the providers' dashboards and a password manager.

### Releasing

1. Merge into `develop` through a pull request (CI: production dependency audit, lint, typecheck, tests, builds, E2E), then `develop` into `master` the same way.
2. Take a manual database backup (below).
3. Tag the release on `origin/master` (`git tag -a vX.Y.Z`, then push the tag); never move a pushed tag.
4. Deploy the API: Render has auto-deploy off, so start a manual deploy of `master`. Pages builds the web app from its production branch on every push (expected `master`; confirm in the Pages settings).
5. Run the smoke test, then check that both dashboards show the tagged commit.

The two deploys aren't atomic: for a while the new web app can talk to the old API, or the reverse. Keep API changes backwards compatible for one release (add fields as optional, remove them later), and deploy the API first when the web app needs a new endpoint.

### Smoke test

```sh
SITE=https://<pages-site>
curl -s -o /dev/null -w "%{http_code}\n" $SITE/api/health      # 200
curl -s $SITE/api/ready                                         # {"status":"ok"}
curl -s "$SITE/api/pets?page=1"                                 # 200, JSON list
curl -s -o /dev/null -w "%{http_code}\n" $SITE/api/auth/me      # 401 (signed out)
curl -s $SITE/api/nope                                          # 404 ROUTE_NOT_FOUND
curl -s -X POST -H "Origin: https://evil.example" $SITE/api/auth/logout   # 403 UNTRUSTED_ORIGIN
API=https://<render-service-host>
curl -s $API/api/ready                                          # 403 PROXY_REQUIRED (no proxy secret)
```

Then in the browser: sign in (the `sid` cookie is `Secure`, `HttpOnly`, `SameSite=Lax`), upload and delete a photo, and check the console for CSP errors. The `logout` request is a safe target for the foreign-`Origin` check: the check refuses it before any route runs.

### Rollback

- **Web:** Pages keeps earlier deployments; roll back from the dashboard.
- **API:** redeploy an earlier Render deploy, or revert on `master` and deploy.
- **Data:** a code rollback doesn't undo data changes, which is why releases avoid destructive schema changes and a backup comes first.

### Backups and restore

- **Database:** a manual `mongodump` with a **read-only** Atlas user, without the `sessions` collection (live session ids would let anyone with the dump sign in as those users), from a machine with Docker (the `mongo:8` image has the tools). Atlas Free has no `--oplog`, so take it at a quiet time.

  ```sh
  mongodump --uri="mongodb+srv://<cluster-host>/" --username=<read-only-user> --password="$MONGO_PW" \
    --db=pet-adoption --excludeCollection=sessions --archive=db-<UTC time>.archive.gz --gzip
  ```

  Pass the password through an environment variable, never on the command line. Atlas accepts the connection only from an IP on its access list; remove a temporary entry afterwards. Keep the archive outside the repository, and store copies encrypted off the machine.
- **Restore drill:** restore into a **separate** database, never over production. The local dev database is also named `pet-adoption`, so map the namespace (`mongorestore --archive=<file> --gzip --nsInclude='pet-adoption.*' --nsFrom='pet-adoption.*' --nsTo='restore-drill.*'`, first with `--dryRun`). Then compare collection names and counts with the dump, check indexes and that `pets.owner` points to restored users, run `pnpm audit:verify` against it (with `AUDIT_HMAC_KEY` for signed entries), and drop the drill database.
- **Photos** are only in Cloudinary; the dump contains their keys, not the files.
- **Status:** see production-readiness.md B3. In short: a tested manual backup exists, but there is no scheduled run, no off-site copy yet and no photo export.

`scripts/backup.sh` (§8) belongs to the self-hosted path and doesn't apply here.

## Self-hosted reference

The rest of this document is the plan for the self-hosted deployment and the reference for its production configuration.

## 1. Hosting decision

Goal: a small public portfolio app at **€0 per month** if that is reliable enough, without rewriting the application. Provider terms were checked on 2026-11-17 (sources in §12). Recheck them before signing up: free tiers change often, and several changed during 2026.

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
                         cron ──▶ scripts/backup.sh ──▶ Backblaze B2 (off-site)
```

- **One origin**, so the session cookie is first-party, `SameSite=Lax` works, and `CORS_ORIGIN` is the site URL. The web app calls the API at the relative path `/api` (`VITE_API_URL=/api`), so the web image doesn't depend on the domain.
- **One API instance**, which is what the in-memory rate limits and local photo storage assume.
- **The files:** [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`Caddyfile`](../Caddyfile) and [`.env.production.example`](../.env.production.example) in the repository root (§4).
- **ARM64 (Ampere):** the images are built on the VM itself. The base images (`node:22-bookworm-slim`, `nginx:1.30-alpine` (the current stable line, checked 2026-11-17: the same image as `nginx:stable-alpine`), `caddy:2`, and `mongo:8` and `alpine:3` for backups) publish `arm64` variants. Every native dependency has a `linux-arm64` glibc build: the lockfile has `@img/sharp-linux-arm64`, `@nx/nx-linux-arm64-gnu`, `@rolldown/binding-linux-arm64-gnu`, `@esbuild/linux-arm64`, `@tailwindcss/oxide-linux-arm64-gnu`, `lightningcss-linux-arm64-gnu` and `@swc/core-linux-arm64-gnu`, and `argon2` 0.45.1 bundles `prebuilds/linux-arm64/argon2.armv8.glibc.node`. The first build on the VM is what proves it (§6, step 7).

Services and accounts needed: Oracle Cloud, MongoDB Atlas, DuckDNS (or a domain registrar), Backblaze B2, and an uptime monitor (any free one, e.g. UptimeRobot).

## 3. Free-tier limits and what they mean here

| Limit | Effect on this app |
| --- | --- |
| Atlas Free: 512 MB | Users, pets, applications and messages are small (KBs per record). Sessions expire after 7 days (TTL). Photos are not in the database. Hundreds of active users fit. Watch "Data Size" in Atlas; upgrade path in §10. |
| Atlas Free: 100 ops/s, 10 GB transfer per 7 days | Far above a small site's traffic. Pages are paginated (12–50 items). |
| Atlas Free: paused after 30 days with zero connections | The running API keeps a connection open, so it doesn't pause. A stopped VM for a month would pause it; resume it in the Atlas UI. |
| Atlas Free: snapshots daily, 4 kept | The nightly `mongodump` (§8) is the longer-term, portable copy. |
| Oracle: idle reclamation (7 days below 20% CPU, network and memory) | A quiet site can look idle. Watch Oracle's emails; keep backups current, because recovery means a new VM and the steps in §6. Upgrading the account to Pay As You Go keeps Always Free resources at no charge and is widely reported to stop idle reclamation, but Oracle's docs don't say so; it also puts a card on an account that could then be billed for anything outside the free limits. Don't run fake-load scripts to dodge the rule. |
| Oracle: home region is permanent; A1 only in it | Choose an EU region at signup: Frankfurt, Milan or Zurich (good latency from Serbia), or Serbia Central (Jovanovac) if it's offered for Always Free; it has one availability domain. |
| Backblaze B2: 10 GB free | Every night uploads a full photo archive and a database dump, and B2 keeps them for 30 days (§8), so usage is about 30 × (photos + dump). Photos are re-encoded (≤ 2000 px, usually well under 1 MB) and dumps are small, so this stays under 10 GB until the photos total roughly 300 MB. Watch the bucket size; shorten the lifecycle rule (e.g. 14 days) before then. |

## 4. Production configuration

Prepared in the repository root (2026-11-17); checked locally (§5), **not yet run on a server**:

| File | Purpose |
| --- | --- |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | `caddy`, `api` and `web` on one internal network; no MongoDB service (Atlas). Only Caddy publishes ports (80, 443 TCP and UDP). Restart `unless-stopped`, health checks on `api` and `web`, log rotation (10 MB × 5) and `no-new-privileges` on every service, named volumes for photos and certificates. |
| [`Caddyfile`](../Caddyfile) | HTTPS for `SITE_DOMAIN` (Let's Encrypt), HSTS, compression; `/api/*` and `/uploads/*` to the API (30 MB body limit), everything else to the web app with CSP, `nosniff`, `Referrer-Policy` and `Permissions-Policy`. No access log, so client IPs and query strings aren't logged. |
| [`.env.production.example`](../.env.production.example) | Placeholders for the values that differ per deployment. Copied to `.env.production` on the server. |
| [`scripts/backup.sh`](../scripts/backup.sh) | The nightly backup (§8): database dump and photo archive, checked, then uploaded to B2; optional monitoring ping. Run from cron with `/bin/sh`. |

Start, stop and inspect it with `--env-file`, which feeds `.env.production` into the compose file (on the VM, the `dc` alias from §6 step 4 is short for this):

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
| Database user, IP allowlist, snapshots | Atlas UI. The allowlist holds the VM's public IP only; update it if that IP changes (§8, "Real recovery"). |
| Firewall | The Oracle VCN security list: only TCP 22, 80, 443 and UDP 443 inbound. It is the control that counts for Docker-published ports (§6 step 4). |
| Backup credentials | `rclone` configuration on the VM (`~/.config/rclone/rclone.conf`): a B2 key that can list and write but not delete (§8). The monitoring ping URL is in the crontab line. |

### API environment as the compose file sets it

Validated at startup (`apps/api/src/core/config/env.ts`); the API refuses to start on a missing or invalid value.

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

**Format of `.env.production`:** two programs read it, and they parse it differently. Docker Compose (`dc`) strips quotes and comments after a value, and treats `$` as a variable. `docker run --env-file` (the Caddyfile check, the admin CLI, the backup script) takes everything after `=` literally, quotes and ` # comments` included. So keep every line plain `NAME=value`: no quotes, no comment after the value, no spaces around `=`, no `$`. Use letters and digits for the Atlas password (Atlas's "Autogenerate" does) and the base64url secrets from the generator command. A value that works with `dc` but contains a quote would silently reach the backup script with the quote in it.

### How it fits the application

- **Cookies:** the API sees `X-Forwarded-Proto: https` from Caddy, Express (`trust proxy` 1) marks the request secure, and express-session sends `sid` with `HttpOnly; Secure; SameSite=Lax`. If the proxy settings were wrong, express-session would **silently not send the cookie**: registration and sign-in return success, but the user isn't signed in. The smoke test checks the cookie for this reason.
- **CORS and CSRF:** browser requests come from `https://${SITE_DOMAIN}` to the same origin, so `Origin` matches `CORS_ORIGIN`; any other `Origin` on a change gets 403 `UNTRUSTED_ORIGIN`.
- **Photos:** the API stores files in the volume and returns `https://${SITE_DOMAIN}/uploads/pets/<random>.<ext>`; Caddy routes `/uploads/*` to the API, which serves them with `nosniff` and long-term caching. The image creates `/app/uploads` owned by the `node` user, and a new named volume copies that ownership, as in Docker QA.
- **Atlas:** `mongodb+srv` uses TLS and DNS SRV lookups (Docker's default DNS is enough). The API checks at startup that the server is a replica set; Atlas clusters are.
- **Shutdown:** `docker compose stop` sends SIGTERM to `node main.js` (PID 1, with its own handlers): the server stops accepting connections, Node 22 closes idle keep-alive connections, then the database connection closes. `stop_grace_period` is 20 s before Docker kills it.
- **Startup failures** (Atlas unreachable, a bad setting) exit the API with a logged reason; `restart: unless-stopped` retries with Docker's back-off, and Caddy answers 502 for `/api` meanwhile.
- **HSTS:** the `Caddyfile` sends `Strict-Transport-Security: max-age=31536000` from the very first HTTPS response. Every browser that visits then refuses plain HTTP for this host name for a year, and if the certificate ever fails (Caddy can't renew, DNS points elsewhere), visitors get an error page with no "continue anyway" option. That is the point of HSTS once HTTPS works, but it can't be taken back quickly. It covers only this host (no `includeSubDomains`, no `preload`), so other `duckdns.org` names aren't affected. If you want a safety margin, set `max-age=300` for the first days and raise it to a year after the smoke test passes; the configuration uses one year as is.
- **CSP:** the built app has no inline scripts and uses no `eval`. Inline `<style>` tags (the toast library, React) need `style-src 'unsafe-inline'`. zod probes for `eval` support with `Function('')` inside a try/catch; the CSP blocks it, the browser logs one CSP warning, and zod falls back to its normal mode. Don't add `'unsafe-eval'` for it.

## 5. Status: prepared, verified locally, still to verify

| | Status |
| --- | --- |
| Configuration files | **Prepared** (§4). |
| `docker compose config` | **Verified locally:** with test values it resolves `NODE_ENV=production`, `TRUST_PROXY=1`, the `https://` origin and photo URL, `VITE_API_URL=/api`, ports only on Caddy, and log rotation, restart policies, volumes and `no-new-privileges` on every service (rechecked 2026-11-17 after the hardening change). With `.env.production.example` as is (empty secrets) it refuses to start. |
| `no-new-privileges`, `nginx:1.30-alpine` | **Not yet run.** Expected to work (no container needs setuid binaries or file capabilities; nginx's `nginx.conf` uses nothing version-specific), but the images weren't started locally. If a container fails to start on the VM with a permission error, its log says so; removing the `security_opt` line from that service is the fallback. |
| Production behaviour of the API | **Verified locally** (2026-11-17) by running the built bundle (`apps/api/dist/main.js`) with `NODE_ENV=production`, `TRUST_PROXY=1` and an `https://` origin against a throwaway in-memory replica set, with requests carrying the headers Caddy adds. 16/16 checks passed: refuses to start without `TRUST_PROXY`; `/api/ready` 200; `sid` is `HttpOnly; Secure; SameSite=Lax`, and missing without `X-Forwarded-Proto`; a foreign `Origin` gets 403; a photo upload is re-encoded into `UPLOADS_DIR` and returned as `https://<site>/uploads/pets/…`, then served with `nosniff`; apply + accept (transactions) adopts the pet; rate limits key on the forwarded client IP; logs are JSON with request ids and contain no emails, passwords, cookies, messages or IPs. |
| Web bundle against the CSP | **Checked locally** by reading the built `index.html` and bundle (no inline scripts, no `eval`); not yet loaded in a browser under the CSP. |
| ARM64 | **Checked in the lockfile and packages** (§2), not built: Docker wasn't available locally, and the real build happens on the VM. |
| `Caddyfile` syntax | **Reviewed by hand only.** Validate on the VM before the first start: `docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" -e SITE_DOMAIN=example.com -e ACME_EMAIL=a@example.com caddy:2 caddy validate --config /etc/caddy/Caddyfile`. |
| Containers running together, certificates, real proxy headers, Atlas (TLS, SRV, transactions on the Free tier), shutdown timing, the CSP in a browser | **Not yet verified:** needs the VM and the Atlas cluster (§6 and the smoke test in §7). |
| Backups | **Script prepared and tested locally with stand-in commands** (2026-11-17, `dash` and `bash`): with fake `docker`, `rclone` and `curl`, a successful run produced both files, uploaded them, then pinged. A failed, truncated or empty dump left `daily/` and `tmp/` empty with no upload and no ping. A failed upload sent no ping. A run killed by a signal cleaned up its partial file. Old files were pruned. A missing photo volume stopped the run before anything was dumped (added in the final review). **Not run for real:** `mongodump` against Atlas, the photo volume, the B2 key's permissions, cron, the monitoring ping and a restore are all still to verify on the VM (§8). |

## 6. First deployment, step by step

These are manual steps: accounts, payment details and DNS are yours to set up. Commands run on the VM, as the default `ubuntu` user, in `/opt/pet-adoption` unless noted. `dc` is an alias defined in step 4.

1. **Code ready:** the blockers in [production-readiness.md](production-readiness.md) §2 are done, CI is green on `develop`, `develop` is merged into `master`, and the release is tagged (`v1.0.0`).
2. **Atlas:** create an account and a Free cluster in Frankfurt (AWS `eu-central-1`, or the nearest EU region offered). Create a database user `pet-adoption-api` with `readWrite` on `pet-adoption` only, with an autogenerated (letters and digits) password. Turn on the Free cluster's daily snapshots. Leave Network Access empty until the VM's IP is known.
3. **Oracle:** sign up (real credit card, accurate details, no VPN), choosing an EU home region (§3). Create an instance: shape `VM.Standard.A1.Flex` (2 OCPU, 12 GB), Ubuntu 24.04, your SSH public key, a public IP. If A1 capacity is unavailable, retry later or try another availability domain.
4. **Server basics.**
   - **Firewall: the Oracle VCN security list is the one that counts.** In the instance's subnet → security list (or a network security group), the ingress rules should be exactly: TCP 22 (SSH; from your own IP if it is stable), TCP 80 and TCP 443 (Caddy), UDP 443 (HTTP/3). Delete any other ingress rule. Nothing else, in particular not the API's port 3333, may be reachable from outside.
   - **Why not the VM's own firewall:** Docker publishes a container port (here only Caddy's 80 and 443) by adding its own `iptables` rules. Traffic to a published port is forwarded to the container *before* the host's normal input rules (Oracle's `iptables` rules, or `ufw`) are checked. So those host rules neither need to open Caddy's ports nor can they hide a published port. That is why only Caddy publishes ports, and why the VCN rules are what keeps everything else closed. Leave Oracle's preinstalled `iptables` rules as they are (they still protect non-Docker services on the host).
   - **Don't reload the host firewall while Docker is running** unless you know what it does. `sudo netfilter-persistent reload`, `iptables-restore`, or turning `ufw` on or off replaces the rule set, Docker's rules included. Published ports and container networking then stop working until `sudo systemctl restart docker`, which also restarts the containers. And `netfilter-persistent save` while Docker runs writes Docker's rules into the saved file. If you must change host rules, do it before installing Docker, or restart Docker straight afterwards and repeat the outside checks in §7.
   - **SSH and updates:** disable SSH password login (`PasswordAuthentication no`), enable `unattended-upgrades`.
   - **Docker Engine:** install it from Docker's own apt repository as described in the official guide, <https://docs.docker.com/engine/install/ubuntu/> (packages `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, `docker-compose-plugin`; not the `docker.io` or snap packages). Check with `docker compose version`.
   - **Docker without `sudo`:** `sudo usermod -aG docker "$USER"`, then log out and back in (<https://docs.docker.com/engine/install/linux-postinstall/>). The backup cron job needs this. Be aware that membership of the `docker` group is **equivalent to root**: anyone who can run containers can mount the host's file system. That is acceptable here because `ubuntu` already has `sudo` and is the only account. Keep it that way, keep the SSH key safe, and never add other users to the group.
   - **Backup tools:** `sudo apt install rclone` (`curl` and `gzip` are preinstalled).
   - **The `dc` alias:** add this line to `~/.bashrc`, then run `source ~/.bashrc`:

     ```sh
     alias dc='docker compose --env-file /opt/pet-adoption/.env.production -f /opt/pet-adoption/docker-compose.prod.yml'
     ```

     It uses absolute paths, so it works from any directory. Aliases exist only in interactive shells: scripts and cron spell the command out.
5. **Address:** at DuckDNS, create `<name>.duckdns.org` pointing at the VM's public IP (or an `A` record at your registrar). In Atlas → Network Access, allow the VM's public IP only (no `0.0.0.0/0`). Both have to be updated if the VM's public IP ever changes (§8, "Real recovery").
6. **Files:**

   ```sh
   sudo install -d -o "$USER" -g "$USER" -m 755 /opt/pet-adoption
   git clone --branch v1.0.0 <repository URL> /opt/pet-adoption    # a tag: "detached HEAD" is expected
   cd /opt/pet-adoption
   cp .env.production.example .env.production   # fill it in (§4), plain NAME=value lines only
   chmod 600 .env.production
   ```

   For a private repository, use a read-only deploy key. Keep nothing else in `/opt/pet-adoption`: everything in it is sent to the Docker build. Backups live in `/var/backups/pet-adoption` (§8).
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

   The same image runs `pnpm audit:verify`. **Never** run `pnpm dev:seed` or `qa:seed` against production: the demo password is public. Demo data for the live demo goes only through `pnpm prod:seed`, with a private `DEMO_PASSWORD`; it is a dry run unless explicitly confirmed (see the header of [`seed-demo.ts`](../apps/api/src/scripts/demo/seed-demo.ts) and [`demo-config.ts`](../apps/api/src/scripts/demo/demo-config.ts)).

   When the admin exists, remove the image: `docker image rm pet-adoption-tools` (and `docker builder prune -f` for its build cache, if disk space matters). It holds the whole source tree and the development dependencies, which the running site doesn't need. It contains no secrets (`.env.production` is excluded from the build and only passed at run time). Rebuild it with the same `docker build` command when you need the CLI again.
10. **Smoke test** (§7), including the checks from outside the VM.
11. **Backups:** set up the nightly backup and do one restore drill (§8) before announcing the site. The setup isn't done until a *scheduled* run has succeeded and its monitoring ping has arrived.
12. **Monitoring:** an uptime check on `https://<name>.duckdns.org/api/ready` with email alerts, plus the backup check from §8.

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

**Negative checks: what must *not* work.** Run these from your own computer, not from the VM. A check run on the VM itself proves nothing about outside access. `<vm-ip>` is the VM's public IP and `<site>` is `SITE_DOMAIN`.

- **Only Caddy's ports are open.** `nc -vz -w 5 <vm-ip> 3333` (PowerShell: `Test-NetConnection <vm-ip> -Port 3333`) must fail or time out; so must 27017 and any other port you try. 80 and 443 succeed; 22 succeeds only from where you allowed SSH. If `nmap` is available, `nmap -Pn <vm-ip>` should list only 22, 80 and 443. On the VM, `dc ps` shows published ports only on `caddy`.
- **Atlas refuses other IP addresses.** In Atlas → Network Access the list holds only the VM's IP. From your computer (not on the list), a connection attempt must time out. It needs no password, because a `ping` doesn't require signing in:

  ```sh
  docker run --rm mongo:8 mongosh "mongodb+srv://<cluster host>/" --eval "db.runCommand({ ping: 1 })"
  ```

  Expected: a server selection or connection timeout after about 30 s. Any answer from the server (`{ ok: 1 }`, or an authentication error) means the network let you in: the allowlist is too wide.
- **A spoofed `X-Forwarded-For` doesn't escape the rate limit.** Caddy replaces the client's header with the real address, so changing it per request must not help. Use an address that has no account. This locks that address out from your IP for 15 minutes and uses 7 of your 20 sign-in attempts per 15 minutes:

  ```sh
  for i in 1 2 3 4 5 6 7; do
    curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<site>/api/auth/login \
      -H 'Content-Type: application/json' -H "X-Forwarded-For: 203.0.113.$i" \
      -d '{"email":"nobody@example.com","password":"wrong-password"}'
  done
  ```

  Expected: `401` five times, then `429`. Only `401`s would mean the API trusts the spoofed header (check `TRUST_PROXY` and the Caddyfile).
- **An ordinary user can't use the admin API.** Signed in as a non-admin test account, run `await fetch('/api/admin/stats').then((r) => r.status)` in the browser console on the site: `403` (`ADMIN_REQUIRED`). Signed out: `401`. The `/admin` page shows "Admins only".

## 8. Backups and recovery

**Status: script and procedure prepared ([`scripts/backup.sh`](../scripts/backup.sh), tested locally with stand-in commands, §5); not yet configured or run on the VM.** Don't consider backups working until a scheduled run has succeeded, its monitoring ping has arrived, and the restore drill below has succeeded.

What must be recoverable: the **database** (Atlas) and the **photos** (the `pet-adoption-prod_uploads_data` volume; the database stores only their keys). Secrets live in the password manager, not in backups.

### Layers

1. **Atlas snapshots:** daily, last 4 kept (Atlas → cluster → Backup). The quickest way back after a recent mistake; restore from the Atlas UI. **Not on Atlas Free:** there, snapshots are a paid add-on (checked 2026-11-18). Without it, layer 2 is the only one.
2. **Nightly copies off both providers:** a database dump and a photo archive, uploaded to Backblaze B2, so losing the VM, the Oracle account or the Atlas cluster loses at most a day.

### Where the files are

| Path on the VM | What | Uploaded to B2 |
| --- | --- | --- |
| `/opt/pet-adoption/scripts/backup.sh` | The script, from the repository (so it changes with the checked-out release) | |
| `/var/backups/pet-adoption/daily/` | Finished, checked files (`db-<time>.archive.gz`, `uploads-<time>.tar.gz`; `<time>` like `2026-11-17T0330Z`, UTC), kept 3 days | **yes** |
| `/var/backups/pet-adoption/tmp/` | Files being written; moved to `daily/` only when complete and valid, deleted on failure | no |
| `/var/backups/pet-adoption/restore-drill/` | Downloads for the restore drill and for real recovery | no |
| `/var/backups/pet-adoption/backup.log` | The cron log | no |

Backups are kept **outside `/opt/pet-adoption`** on purpose. That directory is the Docker build context: `dc build` sends its contents to the builder, so a dump inside it could end up in an image layer or the build cache. (`.dockerignore` and `.gitignore` also exclude `backups/`, mongodump's default `dump/`, `*.archive.gz` (and encrypted `*.archive.gz.7z` copies) and `uploads-*.tar.gz` as a safety net.)

### What the script does

In order, stopping at the first failure:

0. Check that the photo volume exists. Otherwise `docker run -v` would silently create an empty one, and the "backup" would contain no photos.
1. Dump the database with `mongodump` (from the `mongo:8` image, `MONGODB_URI` from `.env.production`) into `tmp/`.
2. Check that the file is non-empty and a complete gzip file, then move it to `daily/`.
3. Do the same for the photo volume (read-only mount, `tar.gz`).
4. `rclone copy daily/` to B2. This is `copy`, not `sync`, so nothing is ever deleted in B2.
5. Delete local files in `daily/` older than 3 days.
6. Only now, if `BACKUP_PING_URL` is set, ping the monitoring service.

On any failure it exits non-zero, removes its partial file, logs `backup FAILED`, and doesn't ping. A partial file can't reach B2, because only `daily/` is uploaded. The ping comes after the upload, so "pinged" means both files are in B2.

### Setup (once)

1. **B2 bucket:** a **private** bucket, e.g. `pet-adoption-backups`. Add a lifecycle rule for the whole bucket (custom rule: hide files 30 days after upload, delete hidden files 7 days later). This rule is the only thing that removes backups, because the VM's key can't.
2. **B2 key for the VM, without delete permission.** Create it on your own computer with the B2 command-line tool and your master key, which never goes on the VM:

   ```sh
   b2 key create --bucket pet-adoption-backups pet-adoption-vm listBuckets,listFiles,writeFiles
   ```

   (Older versions of the B2 CLI call this `b2 create-key`; check `b2 --help`.) Check the capabilities listed for the new key: no `deleteFiles`, and no access to other buckets. Why: if the VM is compromised, an attacker with this key can't delete the existing backups. They can still add files, overwrite a name (which adds a new version) or *hide* files (B2 counts hiding as a write). The lifecycle rule then deletes hidden and superseded versions 7 days later, so a compromise gives you **7 days** to notice and recover those versions with your master key. B2's Object Lock (set on the bucket, with a retention period) would make versions undeletable for that period; it isn't needed to start, but consider it once real data is at stake. That `rclone copy` works with exactly these capabilities is still to confirm on the first run. If it is refused, add only the capability the error names, never `deleteFiles`.

   Also create a second, **read-only** key for restores (`listBuckets,listFiles,readFiles`). Keep it in the password manager, not on the VM; it is used temporarily in the drill and in recovery.
3. **Directories** (owned by `ubuntu`, readable by nobody else):

   ```sh
   sudo install -d -o "$USER" -g "$USER" -m 700 /var/backups/pet-adoption
   install -d -m 700 /var/backups/pet-adoption/daily /var/backups/pet-adoption/tmp /var/backups/pet-adoption/restore-drill
   ```

4. **rclone:** `rclone config` → new remote `b2`, type Backblaze B2, with the VM key's ID and secret; defaults for the rest. It is stored in `~/.config/rclone/rclone.conf` (mode 600). Check: `rclone ls b2:pet-adoption-backups` (empty, no error).
5. **Monitoring of the backup (recommended):** a "dead man's switch", meaning an external service that alerts you when an expected ping *doesn't* arrive. For example, Healthchecks.io (free plan). It is an external account, and the VM must be able to reach it over HTTPS. Create a check with a period of 1 day and a grace time of a few hours, plus email alerts, and copy its ping URL. A failed run and a run that never happened (cron not running, VM down, script missing) both end in the same alert. Without this, the only signal is reading the log. Treat the URL as a password: anyone who has it can send fake "success" pings.
6. **First run, by hand:**

   ```sh
   /bin/sh /opt/pet-adoption/scripts/backup.sh
   rclone ls b2:pet-adoption-backups          # both files, plausible sizes
   ls -A /var/backups/pet-adoption/tmp        # empty
   ```

   It downloads `mongo:8` and `alpine:3` the first time. Without `BACKUP_PING_URL` it pings nothing, so a manual run doesn't count for the monitor. This proves that the script, Docker access, `.env.production` and the B2 key work **from your login shell**. It does **not** prove that cron runs it.
7. **Schedule it:** `crontab -e` as `ubuntu` (not `sudo crontab`), one line:

   ```sh
   30 3 * * * BACKUP_PING_URL=https://hc-ping.com/<your-check-id> /bin/sh /opt/pet-adoption/scripts/backup.sh >> /var/backups/pet-adoption/backup.log 2>&1
   ```

   - The time is the VM's time zone (UTC on Oracle's Ubuntu images; check with `timedatectl`).
   - `/bin/sh` is given explicitly, so the script needs no executable bit.
   - The log must be somewhere `ubuntu` can write. If the redirect target isn't writable (such as `/var/log/...` for a normal user), the shell fails before it even starts the script, and nothing is backed up.
   - The log grows by a few hundred bytes a night; trim it now and then if you like.
8. **Verify the scheduled run** the next morning:
   - `tail -n 20 /var/backups/pet-adoption/backup.log` shows a run at 03:30 ending with `backup finished`;
   - the monitoring check shows a ping at that time;
   - new files are in B2.

   If the log is empty, check `journalctl -u cron --since yesterday`. Also send a test notification from the monitoring service once, to be sure its emails reach you.

Notes: on Atlas Free, `mongodump` works for application databases. It can't dump `admin` or use `--oplog`, which this app doesn't need. The dump contains users' personal data and password hashes, so the bucket must stay private and the keys restricted. Run the script by hand **before every update** (§9).

### Restore drill (before launch, then every few months)

It proves the backups are usable without touching production. Files go to `restore-drill/`, which is never uploaded.

1. Add the read-only key as a temporary remote (`rclone config` → remote `b2restore`), then download the latest pair:

   ```sh
   cd /var/backups/pet-adoption/restore-drill
   rclone ls b2restore:pet-adoption-backups                      # pick the newest <time>
   rclone copy b2restore:pet-adoption-backups/db-<time>.archive.gz .
   rclone copy b2restore:pet-adoption-backups/uploads-<time>.tar.gz .
   ```

2. Restore the database into a **scratch database on the same cluster** (the data is small):

   ```sh
   docker run --rm --env-file /opt/pet-adoption/.env.production -v /var/backups/pet-adoption/restore-drill:/r:ro mongo:8 sh -c \
     'uri=$(echo "$MONGODB_URI" | sed "s#/pet-adoption?#/?#"); mongorestore --uri "$uri" --archive=/r/db-<time>.archive.gz --gzip --nsFrom "pet-adoption.*" --nsTo "restore-test.*"'
   ```

   The database name is removed from the URI so it doesn't override the `--nsTo` target. The dump in `backup.sh` keeps it, which limits the dump to `pet-adoption`.

   The Atlas user needs `readWrite` on `restore-test` too, for the drill only.
3. Unpack the photos into a scratch volume: `docker volume create restore-test-uploads`, then `docker run --rm -v restore-test-uploads:/data -v /var/backups/pet-adoption/restore-drill:/r:ro alpine:3 tar xzf /r/uploads-<time>.tar.gz -C /data`.
4. Check:
   - document counts per collection in `restore-test` match `pet-adoption` (Atlas → Collections);
   - every photo key in `restore-test.pets` exists as a file in the scratch volume:

     ```sh
     cd /var/backups/pet-adoption/restore-drill
     # Photo keys in the restored database ("pets/<id>.<ext>")
     docker run --rm --env-file /opt/pet-adoption/.env.production mongo:8 sh -c \
       'uri=$(echo "$MONGODB_URI" | sed "s#/pet-adoption?#/restore-test?#"); mongosh "$uri" --quiet --eval "db.pets.find({}, { images: 1 }).forEach((p) => (p.images || []).forEach((i) => print(i.key)))"' | sort > keys-db.txt
     # Files in the restored photo volume
     docker run --rm -v restore-test-uploads:/data:ro alpine:3 sh -c 'cd /data && find . -type f | sed "s#^\./##"' | sort > keys-files.txt
     wc -l keys-db.txt keys-files.txt          # plausible numbers, not 0
     comm -23 keys-db.txt keys-files.txt       # keys without a file: must print nothing
     ```

     A few files without a key are fine: the archive is taken a moment after the dump, and a failed upload can leave an orphaned file.
5. Clean up:
   - drop the `restore-test` database in Atlas and remove the drill's `readWrite` grant;
   - `docker volume rm restore-test-uploads` (that scratch volume only);
   - `rm /var/backups/pet-adoption/restore-drill/*`;
   - `rclone config delete b2restore`.

   Note how long it took.

### Real recovery

Downloads for recovery go to `restore-drill/` as in drill step 1. In the commands below, the URI has its database path removed, as in the drill.

- **A recent mistake in the data:** restore an Atlas snapshot (Atlas UI) from before the mistake. Or restore the latest dump over `pet-adoption`. This replaces each collection, so anything written after the dump is lost:

  ```sh
  dc stop api
  docker run --rm --env-file /opt/pet-adoption/.env.production -v /var/backups/pet-adoption/restore-drill:/r:ro mongo:8 sh -c \
    'uri=$(echo "$MONGODB_URI" | sed "s#/pet-adoption?#/?#"); mongorestore --uri "$uri" --archive=/r/db-<time>.archive.gz --gzip --drop --nsInclude "pet-adoption.*"'
  dc start api
  ```

- **Lost photos:** unpack the archive into the production volume. Files keep their owner (uid 1000 = `node`). Existing files with the same name are replaced; other files stay.

  ```sh
  dc stop api
  docker run --rm -v pet-adoption-prod_uploads_data:/data -v /var/backups/pet-adoption/restore-drill:/r:ro alpine:3 tar xzf /r/uploads-<time>.tar.gz -C /data
  dc start api
  ```
- **Atlas is down** (check <https://status.mongodb.com>): there is nothing to restore. `/api/ready` returns 503, the uptime monitor alerts, and pages that need data show errors. The driver reconnects by itself when Atlas is back; if `/api/ready` stays at 503 afterwards, `dc restart api`.
- **Atlas data is corrupted or the cluster is lost:**
  1. If the cluster still exists and a snapshot from before the damage is available (the last 4 days), restore it in the Atlas UI. You're done.
  2. Otherwise, build a replacement:
     - Create a new Free cluster in the same region, and turn on its daily snapshots. Atlas allows one Free cluster per project, so delete the broken one first or use a new project.
     - Create the database user `pet-adoption-api` (`readWrite` on `pet-adoption`) with a new letters-and-digits password, and allow the VM's IP in Network Access.
     - Update `MONGODB_URI` in `.env.production` (new host and password; also in the password manager).
     - Restore the newest dump from B2 with the command above, without `--drop` (the database is empty).
     - Run `dc up -d api`. Compose recreates the container because its environment changed.
     - Check `/api/ready` and sign in. Run `pnpm audit:verify` with the tools image (§6 step 9); the chain still verifies, because `AUDIT_HMAC_KEY` is unchanged.

     Data written since the last dump is lost. Indexes come from the dump, and Mongoose creates any missing ones at startup.
- **The VM's public IP changes** (a new VM, or the public IP was removed and assigned again; a reboot or stop/start normally keeps it): until Atlas allows the new IP, the API can't reach the database. `dc logs api` shows a server selection timeout and `/api/ready` returns 503. Update Atlas → Network Access (remove the old IP, add the new one) and the DNS record at DuckDNS. A reserved public IP avoids this; check whether your tenancy's Always Free limits include one.
- **Lost VM or Oracle account:** a new VM (Oracle again, or Hetzner per §10), §6 steps 3–7, the backup setup above with a new VM key, restore the photos, then update DNS and the Atlas allowlist for the new IP. The database stays on Atlas.
- **Data loss window:** up to a day.

## 9. Updating a release

For every release after the first: a new tag (`v1.1.0`) on `master`, with CI green. The VM runs tags, never branches. Take the steps in order. Downtime is a few seconds while `api` and `web` are recreated; Caddy answers 502 for `/api` meanwhile.

1. **Check the release and the VM.**

   ```sh
   cd /opt/pet-adoption
   git status --short             # must print nothing: the VM has no local edits
   git describe --tags            # the release running now, e.g. v1.0.0
   git fetch --tags
   git log --oneline v1.0.0..v1.1.0
   git diff --stat v1.0.0 v1.1.0 -- docker-compose.prod.yml Caddyfile .env.production.example scripts/ '*.model.ts' apps/api/src/main.ts
   ```

   Look for:
   - new settings in `.env.production.example`: add them to `.env.production` before step 4, or Compose or the API refuses to start;
   - a changed `Caddyfile`: see step 4;
   - changed models or startup data fixes: these affect rollback (step 7).
2. **Back up the database (and photos) first:** `/bin/sh /opt/pet-adoption/scripts/backup.sh`, and check that it ends with `backup finished`. Note the `db-<time>` file name: it's the copy to restore if the release damages data. Every run has its own name, so the nightly run won't overwrite it.
3. **Check out the release:** `git checkout v1.1.0` ("detached HEAD" is expected).
4. **Rebuild, then restart:**

   ```sh
   dc build --pull   # --pull: fetch patched base images; the running containers keep serving meanwhile
   dc up -d      # recreates the services whose image or configuration changed
   ```

   If the `Caddyfile` changed, also run `dc up -d --force-recreate caddy`. The file is mounted on its own, and `git checkout` replaces it with a new file, so a running Caddy container can keep reading the old one.
5. **Verify:**
   - `dc ps`: `api` and `web` are healthy;
   - `curl -fsS https://<site>/api/ready` returns ok;
   - `dc logs --since 10m api` has no `unexpected error`;
   - then the smoke test (§7), at least sign-in and the cookie, a pet with a photo, and whatever the release changed.
6. **Roll back if necessary:**

   ```sh
   git checkout v1.0.0
   dc build && dc up -d       # plus --force-recreate caddy if the Caddyfile differs
   ```

   The build cache usually makes this faster than the first build (as long as it hasn't been pruned; see step 8).
7. **Database compatibility and rollback.** The project has **no migration system**. Data changes happen when Mongoose models gain fields; new fields have defaults or are filled in when read (like the pet profile facts), so older documents stay valid. There are no startup data fixes.
   - If a release only adds fields or data, the previous release still runs on the same database: rolling back the code (step 6) is enough.
   - If a release renames, removes or reshapes stored data (step 1's diff shows it), the previous release may not understand what the new one wrote. Then rolling back means the code **and** restoring the dump from step 2 (§8, "Real recovery", with `--drop`), which loses everything written since the update. Know which case you're in before updating.
   - When writing such a release, prefer two steps: first add the new shape while still reading the old one, then remove the old one in a later release.
8. **Clean up** once the new release has run well for a few days:

   ```sh
   docker image prune -f                           # old, now untagged images
   docker builder prune -f --filter until=168h     # build cache older than a week
   docker system df                                # what's left
   ```

   Never `docker volume prune`, `docker system prune --volumes` or `dc down -v`: they can delete the photo and certificate volumes. `docker image prune -a` would also remove `mongo:8` and `alpine:3`, which the next backup then downloads again.

### Regular maintenance (monthly, about 15 minutes)

Nothing here happens by itself. Without it the server slowly falls behind on security fixes or fills its disk.

- **Operating system:** `unattended-upgrades` installs Ubuntu's security updates, but doesn't reboot, and doesn't update Docker (it comes from Docker's own repository). Run `sudo apt update && sudo apt upgrade`, which updates Docker too and restarts its daemon and the containers (brief downtime). If `/var/run/reboot-required` exists, reboot at a quiet time with `sudo reboot`. The services come back by themselves (`restart: unless-stopped`); check `dc ps` and `/api/ready`.
- **Container images:** a cached build keeps using the old base images, so security fixes in Node, nginx and Alpine only arrive with `--pull`. Even without a release, run `dc build --pull && dc pull caddy && dc up -d`, plus `docker pull mongo:8 alpine:3` for the backup tools. Then run the smoke test's first two checks.
- **Disk:** `df -h /` and `docker system df`. Clean up as in step 8 above the 70% mark.
- **Backups:** the end of `backup.log`, the monitoring check's history, and the B2 bucket size against the 10 GB free tier (§3).
- **Accounts:** Atlas "Data Size" against 512 MB, and any emails from Oracle (idle reclamation, §3), Atlas, Let's Encrypt or Backblaze.
- **Every few months:** the restore drill (§8) and `pnpm audit:verify` (§6 step 9).

## 10. Migration path when the free tier isn't enough

| Trigger | Move |
| --- | --- |
| Oracle refuses signup, has no capacity, or reclaims or terminates the VM | Same compose file on Hetzner CX23 (~€6/month): §6 steps 4–12, restore the photo archive. Atlas stays as is. |
| Database approaching 512 MB | Atlas Flex (~$8/month base, capped at $30) with Atlas's upgrade, or MongoDB in the compose stack on the VM (restore a dump; add it to the nightly backup). |
| A real domain wanted | Register one (~€10–15/year), point it at the VM, change `SITE_DOMAIN` in `.env.production` and run `dc up -d` (`CORS_ORIGIN`, `UPLOADS_BASE_URL` and the Caddy site follow from it; the web image uses the relative `/api` and needn't be rebuilt). Photo URLs follow automatically (only keys are stored); users sign in again once. Browsers keep the old name's HSTS entry, which doesn't matter once it's no longer used. |
| More than one API instance needed | Not before real growth: needs a shared rate-limit store (Redis/MongoDB) and object storage for photos. |

## 11. Reference

### Same-site cookies

The session cookie is `HttpOnly`, `SameSite=Lax`, 7 days, `Secure` with `NODE_ENV=production`. It works with one origin (`/api` behind a proxy, as here) or with subdomains of one registrable domain you control (`app.example.com` + `api.example.com`). It does **not** work across platform domains on the Public Suffix List (`*.onrender.com`, `*.netlify.app`, `*.vercel.app`, `*.pages.dev`), even between two subdomains of the same platform; that would need `SameSite=None; Secure` plus CSRF tokens, which the code doesn't have.

### `TRUST_PROXY`

Express's `trust proxy` (`apps/api/src/core/config/trust-proxy.ts`), validated at startup and required in production. It decides the client IP (per-IP rate limits) and whether the request was HTTPS (`Secure` cookies).

- `false`: no proxy (local development, Docker QA).
- A hop count `1`–`10`: trust that many proxies. Safe only if clients **cannot reach the API except through them**.
- A list of proxy addresses (`loopback`, `10.0.0.5`, `172.18.0.0/16`, `uniquelocal`): only those are trusted.
- Refused: `true`, `0`, `0.0.0.0/0`, `::/0`, malformed values.

Each trusted proxy must set `X-Forwarded-Proto` and set or append `X-Forwarded-For` (Caddy does both by default).

### CORS and CSRF

`CORS_ORIGIN` is the one allowed origin. The same value drives the CSRF check: state-changing requests with a different `Origin` get 403 `UNTRUSTED_ORIGIN`.

### Logs

- One JSON object per line on stdout (`apps/api/src/core/logging/logger.ts`); read with `docker compose logs api`. No central log storage, alerting or error tracking yet.
- Logged: startup and shutdown, one `request completed` line per request (request id, method, path without query string, status, duration, `userId` when signed in), `unexpected error` with the stack for every 500, database connection changes, failed photo deletions.
- Never logged: bodies, query strings, headers and cookies, emails, names, client IPs. Error messages are scrubbed of URL credentials (such as the Atlas password) and duplicate-key values.
- Every response has an `X-Request-Id` header; search the logs for it to find a failure.

### Photos

Stored under `UPLOADS_DIR` (a persistent volume). Every upload is decoded and re-encoded with sharp (no metadata, rotation applied, ≤ 2000 px); the uploaded bytes are never stored. Start production with an empty uploads volume; never copy development or QA uploads into it. Limits: 5 MB per file, 5 files per request, 5 photos per pet, at most 2 images processed at once. A host without persistent disk needs an object-storage implementation of `FileStorage` (`apps/api/src/core/storage/`) and the provider's SDK as a new dependency.

### Rate limits and several instances

All rate-limit counters are in the API process's memory: correct for one instance, reset on restart.

### Admin audit log

`pnpm audit:verify` checks the hash chain. To detect someone with database access deleting the newest entries, run it on a schedule and keep a copy of the chain head (`auditchainheads`: last `seq` and `hash`) outside the database.

### Rollback

See §9, steps 6 and 7.

## 12. Sources (checked 2026-11-17)

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
