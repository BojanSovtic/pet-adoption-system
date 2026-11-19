# Progress

_Last updated: 2026-11-19, after the first maintenance session (backup, restore drill, first admin). `master` = `e158a4f`, tagged `v1.1.0`. Earlier dated entries are in the Git history of this file._

## Status

**Deployed as a demo on managed free tiers (2026-11-18):** `https://pet-adoption-26o.pages.dev`. Hosting: Cloudflare Pages (web app + a Pages Function that proxies `/api`), Render Free (the API's Docker image, Frankfurt), MongoDB Atlas Free (Frankfurt), Cloudinary Free (photos). It replaces the Oracle VM plan, which needed a card. The self-hosting setup (`docker-compose.prod.yml`, `Caddyfile`, `scripts/backup.sh`, [deployment.md](deployment.md)) stays in the repository; the managed settings are in [`.env.render.example`](../.env.render.example).

- **Verified on the live site:** smoke test through the site (health, readiness, lists, error codes, forged proxy headers stripped, foreign `Origin` refused, security headers); direct calls to the API host refused (`PROXY_REQUIRED`); registration with a `Secure`/`HttpOnly`/`SameSite=Lax` session cookie that survives a reload; pet creation and a photo upload served from Cloudinary without CSP errors.
- **First maintenance session (2026-11-19; details in the owner's local notes, `docs/learning/`, which aren't in the repository):**
  - 2FA (authenticator app) on Atlas, Cloudflare, Render, Cloudinary, GitHub and UptimeRobot.
  - Read-only Atlas user `pet-adoption-backup` (`read@pet-adoption`).
  - Two manual `mongodump` archives on the owner's PC, outside the repository: one before the admin grant, one after.
  - A restore drill of the first archive into a local `restore-drill` database passed: collections, counts, indexes, `validate`, `audit:verify`. The drill database was dropped afterwards.
  - First admin granted with `pnpm admin:grant` (dry run first). The admin area and audit log were checked in the browser, and `/api/admin/*` returns 401 without sign-in.
  - Two UptimeRobot monitors, every 5 minutes: Render `/api/health` and the site's `/api/ready`.
  - The temporary Atlas IP entry was removed.
- **Not yet done:**
  - an off-machine copy of the backups (they exist only on the owner's PC);
  - scheduled backups;
  - a backup of the Cloudinary photos;
  - on the live site: the 403 check for a signed-in non-admin (covered by tests), the photo-deletion check and the rate-limit check;
  - a repository document for the managed deployment.

The scope stays frozen for features; the next work is closing the deployment (above), then the items before real users (B5, B6).

## What exists

Rules are in [requirements.md](requirements.md); structure and flows in [architecture.md](architecture.md).

- **Pets:** public, paginated list with name search, species/status filters and whitelisted sorts (state in the URL); details; create, full-replacement edit and delete for the owner only (delete blocked by pending or accepted applications); profile facts (sex, breed, compatibility, time alone); up to 5 photos per pet with a main photo, re-encoded server-side; "My pets".
- **Adoption applications:** apply, withdraw, accept and reject through a shared state machine; every change in a transaction that locks the pet; unique indexes as the final guarantee; paginated applicant and owner views.
- **Accounts:** registration and sign-in with server-side sessions, Argon2id, rate limits; account menu; sign-in redirects that return to the original page.
- **Messaging and profiles:** one conversation per pet and interested user, visible only to the two participants; public profiles with name, join date and listed pets (signed-in users only).
- **Administration:** admin role (first admin via `pnpm admin:grant`), user suspension, hiding listings, read-only application oversight, statistics, and a hash-chained audit log checked by `pnpm audit:verify`.
- **Cross-cutting:** English and Serbian UI; stable API error codes translated in the web app; route error boundaries; structured JSON logs with request ids; `/api/health` and `/api/ready`; security headers; per-user and per-IP write limits.
- **Environments:** local development, Docker QA (`pnpm qa:*`) and E2E (README, "Running the app").
- **Tests:** API (Vitest + Supertest, in-memory replica set), web (Vitest + Testing Library), E2E (Playwright against a production build); CI runs a production dependency audit, lint, typecheck, tests, builds and E2E.

## Open issues

Deployment and launch blockers, recommendations and decisions D1–D6 are in [production-readiness.md](production-readiness.md). Smaller known issues:

- **Cold start through the proxy:** while Render Free sleeps, requests through the Pages Function get Render's immediate HTML `502` (`x-render-routing: no-deploy`) and don't wake the service. A direct request to the Render host does wake it (seen 2026-11-18 and 2026-11-19). The UptimeRobot monitor works around this by keeping the API awake, which reverses the earlier "no keep-awake pings" decision; the owner still has to confirm it. The alternative fix is in code: the Function waits and retries while Render wakes.

- **Photos:** uploads are buffered in memory (5 MB each); a crash between writing a file and the database update can leave an orphaned file (no cleanup job).
- **Rate limits** are in memory: they reset on restart, aren't shared between instances, and users behind one IP share the per-IP budgets.
- **Accounts:** registration reveals whether an email exists (409); no email verification, "sign out other sessions" or idle timeout (fixed 7-day sessions); no `argon2.needsRehash` upgrade path.
- **Privacy by design:** applicants' emails are visible to the owners of pets they applied for; member names are visible to signed-in users.
- **Code health** (see the audit notes in "Architecture notes" below): mixed `@/…` and relative imports in the web app; React Router v6 future-flag warnings.
- **Not verified by hand:** the account menu with a screen reader and on a touch device; forms on a phone.

## Architecture notes (2026-11-16 audit)

Recorded so they aren't rediscovered; none blocks deployment.

- **Nx:** module boundaries aren't enforced (`depConstraints` allow `*` → `*`; `web` and `web-e2e` have no tags). With one shared library the risk is small; add `scope:web` / `type:app` tags and real constraints when a second library appears. Leftover generated config: the `nx-release-publish` target on the API, `@nx/react/router-plugin` in `nx.json` (the web app is a Vite SPA, not React Router framework mode), and dev dependencies that may be unused (`@babel/*`, `@swc/*`, `ts-node`). Check each before removing.
- **Web:** `features/auth/utils/set-current-user.ts` imports every feature's query keys, so `auth` and the other features import each other. It works; if it grows, move identity-change cache clearing into `app/` or give per-user keys a common prefix. API modules are one file per endpoint in `pets` and one file per feature elsewhere; leave as is unless a feature is reworked. The largest page, `pet-form-page.tsx` (~590 lines), is the first candidate for extracting a hook if it changes again.
- **API:** `emptyToUndefined` and `MAX_PAGE` are repeated in four `*.schema.ts` files; `pet.controller.ts` queries `PetModel` directly once (`requirePetImageCapacity`).

## Next steps

**Current (2026-11-19):** done in the first maintenance session: admin, first backup and restore drill, 2FA, monitoring.

1. **Decide on keep-awake.** Either keep the UptimeRobot ping to Render, or remove it and make the Pages Function wake Render (a code change; see "Open issues").
2. **Off-machine copy of the backups:** an encrypted `.7z` (AES-256, `-mhe=on`) to a personal cloud account or a USB drive kept apart from the PC.
3. Remaining checks on the live site: photo deletion in Cloudinary, the per-IP limit, and optionally the 403 for a signed-in non-admin (with a second account).
4. Document the managed deployment in the repository (a `docs/deployment-free.md`, including the tested backup and restore-drill procedure, which so far exists only in the local notes). Then update `architecture.md` and `production-readiness.md`, which still describe the Oracle plan.
5. Automate backups (nightly, encrypted, off-site) plus a Cloudinary export. Then the demo polish: a cold-start hint, a demo notice, demo listings, README screenshots.
6. Before inviting real users: B5 (a privacy notice naming the hosting providers) and a decision on B6 (password reset).

Before every release, take a manual backup (M10) first.

**History:** the items below are the plan from before the hosting change (Oracle VM); steps 1–2 are done (`v1.0.0`, then `v1.1.0` with the managed-hosting code), and step 3 was replaced by the managed deployment.

1. Production configuration reviewed and corrected (2026-11-17). Changes: the backup is now a script, `scripts/backup.sh` (temporary files, gzip checks, upload before the monitoring ping, backups in `/var/backups/pet-adoption` outside the build context, cron log the deploy user can write). Also `nginx:1.30-alpine`, `no-new-privileges` on all services, and new deployment.md sections: updating a release with rollback (§9), firewall and Docker networking, a B2 key without delete, Atlas recovery, negative smoke checks. Checked locally: compose config, and the script with stand-in commands (deployment.md §5). Committed as `5334e12`. The final review (same day) added a missing-volume guard to the backup script, executable restore-drill checks, a monthly maintenance routine (deployment.md §9) and a corrected B2 key description. Commit these. B2–B4 stay open until the stack runs on the VM; B1 (Mongoose) is done.
2. Merge `develop` into `master` through a pull request.
3. Deploy following [deployment.md](deployment.md) §6 (Oracle Cloud Always Free VM + MongoDB Atlas Free), then the smoke test and a restore drill.
4. Before inviting users: B5 (privacy notice) and a decision on B6 (password reset).
5. Add README screenshots (instructions in the README).

## Developer notes

- **MongoDB must be a replica set.** `docker compose up -d` runs a single-node set `rs0` on host port 27018; its health check initialises it on the first start. Docker Desktop must be running before the API starts.
- **Leftovers from removed environments** (the old Docker app stack and demo environment, removed 2026-10-28) may still exist locally: the database `pet-adoption-demo`, `tmp/demo-uploads/`, the volume `pet-adoption-system_uploads_data` and old `pet-adoption-api` / `pet-adoption-web` containers. Remove them by hand if wanted (`docker compose down --remove-orphans`, without `-v`).
- **`env.ts` resolves `.env` relative to the working directory.** Nx loads `apps/api/.env` into its tasks, E2E starts the API from the repo root, and Docker passes variables directly, so every documented workflow works; a file-relative path would differ between `src/` and the bundle.
