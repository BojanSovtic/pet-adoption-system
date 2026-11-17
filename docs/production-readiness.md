# Production readiness

_Re-assessed 2026-11-16 against `develop` (`2e496d7` plus the audit's cleanup); updated 2026-11-17 for the hosting decision and the Mongoose upgrade. The earlier batch-by-batch hardening log is in the Git history of this file._

The application itself is in good shape for a small first release: the security controls below are implemented and tested. What is missing is mostly **operational**: a production configuration, backups, and two pieces of legal/account basics. The recommended hosting is free: an Oracle Cloud Always Free VM with MongoDB Atlas Free; how and why is in [deployment.md](deployment.md).

## 1. In place (verified in code and tests)

| Area | What | Evidence |
| ---- | ---- | -------- |
| Sessions | Server-side sessions in MongoDB (7-day TTL); `sid` cookie `HttpOnly`, `SameSite=Lax`, `Secure` in production; new id on sign-in; destroyed on sign-out | Tested (`auth.controller.spec.ts`); `Secure` only in code until a deployment |
| CSRF | `SameSite=Lax` plus an `Origin` check on unsafe methods | Tested (`UNTRUSTED_ORIGIN`) |
| Passwords | Argon2id, 64 MiB, 3 passes, pinned in `auth/password.ts`; dummy hash for unknown emails (timing) | Tested (`password.spec.ts`) |
| Abuse limits | Per-IP sign-in/registration, per-IP+email failed logins, per-user write limits (burst + daily), per-admin limits, per-IP write backstop | Tested (`RATE_LIMITED`); memory only, one instance |
| Authorization | Owner and sender ids from the session; owner-scoped queries; strangers get 404 for applications and conversations; role and suspension read from the database on every request | Tested |
| Data integrity | Application/pet changes in transactions that lock the pet first; unique partial indexes (one active application per user and pet, one accepted per pet); unique email | Tested, including concurrent acceptances |
| Input validation | zod on every body and query; repeated query parameters rejected; ObjectId checks; 100 kB JSON limit | Tested |
| Uploads | Auth, rate limit and ownership checked before parsing; type from magic bytes; re-encoded with sharp (no EXIF/GPS); 5 MB / 5 files; pixel limit; `nosniff`; random keys | Tested (`pet-image.spec.ts`) |
| Errors and headers | JSON errors only (`{ code, details? }`), no stack traces to clients, JSON 404 for unknown `/api` routes, helmet headers, no `X-Powered-By` | Tested (`app.spec.ts`) |
| Config | Env validated at startup (secrets ≥ 32 characters, `TRUST_PROXY` required in production, `LOG_LEVEL`); only `.env.example` files tracked | Tested (`trust-proxy.spec.ts`), `git ls-files` |
| Observability | JSON logs with request ids, no bodies/PII; `/api/health` and `/api/ready` | Tested (`logging.spec.ts`, `app.spec.ts`) |
| Lifecycle | Graceful shutdown on SIGINT/SIGTERM; clear startup failure when the port is taken or MongoDB isn't a replica set | `listen.spec.ts`; code |
| Admin | `requireAdmin` on the whole `/api/admin` router; provisioning only via `admin:grant`; audited transactions; hash-chained, tamper-evident audit log | Tested (API, web, E2E) |
| Frontend | Route error boundaries; identity changes clear per-user caches; return paths after sign-in limited to same-app paths | Tested |

## 2. Blockers

### Before any deployment

| # | Problem | What to do |
| - | ------- | ---------- |
| B1 | ~~**`mongoose` 9.9.5 had two high advisories**~~ (GHSA-gg4r-jv3p-qx3c, connection-level `sanitizeFilter` not applied, which this app doesn't use; prototype walking on hydrate/set/merge) and two moderate ones. | **Resolved 2026-11-17:** `mongoose ~9.11.4` and `mongodb ~7.7.0` (the driver Mongoose 9.11 uses, so connect-mongo and Mongoose share one copy) in the root and `apps/api/package.json`. `pnpm audit --prod --audit-level high` passes; only React Router's two moderate advisories remain (§4). |
| B2 | **No production configuration exists.** The only built-image stack is Docker QA (`NODE_ENV=development`, plain HTTP, ports on 127.0.0.1). | Add `docker-compose.prod.yml` and a `Caddyfile` as described in [deployment.md](deployment.md) §4: the QA stack without its MongoDB (the database is Atlas), plus Caddy for TLS; `NODE_ENV=production`, `TRUST_PROXY=1`, `CORS_ORIGIN`, **`UPLOADS_BASE_URL`** (its default is an `http://` URL), secrets in `.env.production` on the server, only Caddy's ports published, container log rotation. |
| B3 | **No backups.** The database and the photo volume would have no copy. | Atlas Free daily snapshots, plus a nightly `mongodump` and photo archive copied to Backblaze B2 (off Oracle), and one restore drill before launch ([deployment.md](deployment.md) §8). |
| B4 | **Untested behind a real proxy.** `Secure` cookies, client IPs and HTTPS detection depend on `TRUST_PROXY` matching the proxy. | Run the smoke test ([deployment.md](deployment.md) §7) on the deployed stack before inviting users. It also confirms transactions on Atlas Free and the ARM build of `sharp` and `argon2`. |

### Before real users register

| # | Problem | What to do |
| - | ------- | ---------- |
| B5 | **No privacy notice or operator contact**, while the app stores names, emails, messages and photos, and shows applicants' emails to pet owners. | A privacy page (who runs the site, what is stored, who sees it, how to ask for deletion), a footer link, and a note on the apply form that the owner will see your name and email. Needs decision D4. |
| B6 | **No password reset.** A user who forgets their password can't recover the account (emails are unique, so they can't re-register either). | Either build reset by email (single-use, expiring, hashed token; sessions revoked; needs D2), or launch only to a small group you can help directly and treat reset as the first post-launch feature. |

## 3. Recommended for the first public release

Not blockers, but cheap and worth doing early:

- **Web security headers and compression** at the proxy (HSTS, CSP, `Referrer-Policy`, `nosniff`, gzip); a starting Caddyfile is in [deployment.md](deployment.md).
- **Uptime monitoring** on `/api/ready` with email alerts.
- **Require `UPLOADS_BASE_URL` in production** in `config/env.ts`, like `TRUST_PROXY`, so a missing value fails at startup instead of producing broken photo URLs.
- **Shutdown timeout:** `server.close()` waits for idle keep-alive connections; Docker kills the process after 10 s anyway, but closing idle connections (`server.closeIdleConnections()`) makes restarts clean.
- **Account deletion process.** There is no deletion yet, and deleting a user directly in the database would leave pets, applications and conversations pointing at a missing user. Until it exists, the privacy notice must say how deletion requests are handled.
- **Decide D5 and D6** (below) and document the result in `requirements.md`.
- **Clear cached pet details on identity change.** `setCurrentUser` removes per-user data but not `['pets', 'detail', …]`, so a hidden pet viewed by its owner or an admin stays in that tab's memory cache after sign-out.

## 4. Can wait until after the first deployment

- Email notifications for new applications and decisions (needs D2).
- Error tracking (Sentry or similar, D3); central log storage.
- React Router 7 (two moderate advisories in 6.30.6: one is SSR-only and doesn't apply; the other, a backslash open redirect in `<Link>`/`navigate`, is already guarded for the only user-controlled path, `getReturnPath` in `login-page.tsx`).
- Code splitting (one 716 kB / 218 kB gzipped chunk as of 2026-11-16), automated accessibility checks (`@axe-core/playwright`).
- User reports of listings/accounts; blocking in messaging.
- A shared rate-limit store and object storage for photos: only needed for several API instances or a host without persistent disk.
- Scheduled `audit:verify` with the chain head stored outside the database.
- Building images in CI and pushing them to a registry instead of building on the server.
- Product batches B–D from [ux-benchmark.md](ux-benchmark.md), favourites, OAuth sign-in.

## 5. Decisions needed

- **D1, hosting:** recommended 2026-11-17: Oracle Cloud Always Free VM (existing Docker stack + Caddy) with MongoDB Atlas Free and a free DuckDNS name; fallback a Hetzner CX23 at about €6/month ([deployment.md](deployment.md) §1). Still yours to confirm: the Oracle signup (credit card for verification), the home region, and whether to buy a domain instead of DuckDNS.
- **D2, email provider** (e.g. Postmark, SES, Resend), for password reset and notifications.
- **D3, error tracking** or logs only (logs only is fine to start).
- **D4, legal:** the operator identity and contact for the privacy notice; how long applications, messages and suspended accounts are kept.
- **D5, conversations about hidden listings:** starting one is refused (404), but replies in an existing conversation still work, because `sendReply` doesn't check the pet. Decide whether they continue, become read-only, or close.
- **D6, suspended owners:** their pets stay listed, so people can still apply and message, but the owner can't sign in to answer. Decide whether suspension should also hide listings or block new contact.
