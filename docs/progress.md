# Progress

_Last updated: 2026-11-16, after the pre-deployment audit. Branch `develop` (`2e496d7` plus uncommitted audit cleanup); `master` is behind `develop` (last merged through PR #1). Earlier dated entries are in the Git history of this file._

## Status

**Feature-complete for a first version; not deployed.** The scope is frozen: the next work is the deployment blockers in [production-readiness.md](production-readiness.md) §2 and the deployment itself ([deployment.md](deployment.md)), not new features.

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

1. Review the prepared production configuration (`docker-compose.prod.yml`, `Caddyfile`, `.env.production.example`; checked locally 2026-11-17, deployment.md §5). B2–B4 stay open until it runs on the VM; B1 (Mongoose) is done. CI green on `develop`.
2. Merge `develop` into `master` through a pull request.
3. Deploy following [deployment.md](deployment.md) §6 (Oracle Cloud Always Free VM + MongoDB Atlas Free), then the smoke test and a restore drill.
4. Before inviting users: B5 (privacy notice) and a decision on B6 (password reset).
5. Add README screenshots (instructions in the README).

## Developer notes

- **MongoDB must be a replica set.** `docker compose up -d` runs a single-node set `rs0` on host port 27018; its health check initialises it on the first start. Docker Desktop must be running before the API starts.
- **Leftovers from removed environments** (the old Docker app stack and demo environment, removed 2026-10-28) may still exist locally: the database `pet-adoption-demo`, `tmp/demo-uploads/`, the volume `pet-adoption-system_uploads_data` and old `pet-adoption-api` / `pet-adoption-web` containers. Remove them by hand if wanted (`docker compose down --remove-orphans`, without `-v`).
- **`env.ts` resolves `.env` relative to the working directory.** Nx loads `apps/api/.env` into its tasks, E2E starts the API from the repo root, and Docker passes variables directly, so every documented workflow works; a file-relative path would differ between `src/` and the bundle.
