# Progress

_Last updated: 2026-10-23. Branch `develop` at `e02c2a4` (multiple photos). Uncommitted: the isolated Docker QA environment (see "Docker QA environment")._

## Status

### Completed and verified

Verified by passing tests or by reading the code.

- **Pets API:** `GET`, `POST`, `PUT` (full replacement) and `DELETE` on `/api/pets[/:id]`, with consistent `{ code, details? }` errors.
  - **Public:** listing and details. They include `owner` as a user id only.
  - **Paginated listing:** `GET /api/pets?search=&species=&status=&sort=&page=&pageSize=` → `{ items, page, pageSize, totalItems, totalPages }`.
    - **Search:** names only (there's no breed field), case-insensitive "contains", with regex characters escaped.
    - **Filters:** `species` and `status`.
    - **Sort:** a whitelist of `newest` (default), `oldest`, `name` (case-insensitive collation) and `age`, each with `_id` as a tie-breaker for a stable order across pages.
    - **Paging:** `page` defaults to 1 (at most 10,000); `pageSize` defaults to 12 (at most 50).
    - **Validation:** invalid values → 400 `VALIDATION_FAILED` with details; empty values count as unset; repeated parameters are rejected; unknown ones are ignored.
    - **Index:** `{ createdAt: -1, _id: -1 }` for the default sort.
    - **Tests:** 27 API tests.
  - **Signed-in only:** create, update and delete (`requireAuth` → 401).
  - **Owner from the session:** `owner` is required and set from the session, never from the body.
  - **Owner-only changes:** owner-scoped queries; a non-owner gets 403 `NOT_PET_OWNER`.
  - **Deleting:** runs in a transaction. It's blocked by pending or accepted applications (409 `PET_HAS_ACTIVE_APPLICATIONS`); otherwise the pet's rejected and withdrawn applications are deleted with it.
- **Pet photos** (up to 5 per pet since 2026-10-22; see "Multiple photos" below for the current behaviour; the single-photo notes here are historical):
  - **Storage:** files on local disk behind a `FileStorage` interface (`storage/`). A pet stores an `imageKey`; the API returns `imageUrl` (or `null`). Files are served at `/uploads` with `X-Content-Type-Options: nosniff` and immutable caching.
  - **Upload:** `PUT /api/pets/:id/image`, multipart with one file in the field "image".
    - **Order of checks:** `requireAuth` → owner check (before the body is read) → `multer` (in memory, at most 5 MB) → type detection from the file's bytes (JPEG/PNG/WebP).
    - **Filenames:** random, and the extension comes from the detected type.
  - **Errors:** 401; 403 `NOT_PET_OWNER`; 404 `PET_NOT_FOUND`; 400 `INVALID_PET_ID` / `IMAGE_REQUIRED` / `INVALID_IMAGE_UPLOAD`; 413 `IMAGE_TOO_LARGE`; 415 `UNSUPPORTED_IMAGE_TYPE`.
  - **Removing:** `DELETE /api/pets/:id/image`, owner only.
  - **Orphaned files:**
    - On replacement, the old file is deleted after the database update (`returnDocument: 'before'` reports the replaced key, which is safe under concurrent uploads).
    - A failed database update deletes the new file.
    - Deleting a pet deletes its photo after the transaction.
    - A failed file deletion is logged, not fatal.
  - **Web:**
    - **Form:** a photo field with a preview, Remove, and quick type/size checks. The form saves the pet first, then uploads or removes the photo. If only the photo step fails, the pet stays saved and the user sees "The pet was saved, but the photo was not: …".
    - **Card and details page:** use `imageUrl`.
    - **`apiClient`:** sends the JSON `Content-Type` only for string bodies, so `FormData` gets the browser's multipart boundary.
  - **Tests:** 15 API tests and 6 web tests.
- **Adoption applications** (see `docs/architecture.md` §5 for the diagrams):
  - **Data:** `AdoptionApplication { pet, petOwner, applicant, message (1–2000), status, timestamps }`. The applicant comes from the session; `petOwner` is copied from the pet on submit; the status only changes through state-machine actions.
  - **Endpoints:**
    - `POST /api/pets/:petId/applications` → 201.
    - `GET /api/applications/mine?page=&pageSize=&pet=`: paginated applicant view, with pet summary and no owner details.
    - `GET /api/applications/received?page=&pageSize=`: paginated owner view, including the applicant's name and email.
    - `POST /api/applications/:id/accept | reject | withdraw`.
    - All of them require sign-in.
  - **Rules:**
    - **Signed-in users only.** You can't apply for your own pet (403 `CANNOT_APPLY_TO_OWN_PET`), or for an adopted or ownerless pet (409 `PET_NOT_AVAILABLE`).
    - **One non-withdrawn application per user and pet** (409 `ALREADY_APPLIED`, enforced by a unique partial index). No reapplying after rejection; a withdrawn application can be replaced.
    - **Who may act:** only the pet owner accepts or rejects, and only the applicant withdraws (otherwise 403 `NOT_PET_OWNER` / `NOT_APPLICANT`). Anyone else gets 404 `APPLICATION_NOT_FOUND`.
    - **Final states:** accepted, rejected and withdrawn can't change (409 `INVALID_STATUS_TRANSITION`). Acceptance is final.
  - **State machines** (shared library `adoption-application.model.ts`):
    - Application: `pending` → `accepted` / `rejected` / `withdrawn`, plus the system's `autoReject`.
    - Pet: `available` ⇄ `pending` → `adopted`, derived from application events.
  - **Transactions:** submit, accept, reject, withdraw and pet delete each run in one MongoDB transaction (`withTransaction`).
    - **Locking:** each transaction first writes the pet (`lockPet`), so concurrent transactions on the same pet conflict and are retried one after another.
    - **Accepting:** in one transaction, the pet is claimed (`pending` → `adopted`), the application is accepted, and the other pending applications are rejected.
    - **Final guarantee:** a unique partial index allows at most one accepted application per pet.
  - **Tests:** 53 new API tests.
    - **State machines:** every transition from every state.
    - **Submitting:** validation, duplicates, reapplying, self-application, and adopted or ownerless pets.
    - **Privacy:** who sees what, and 404s for strangers.
    - **Transitions:** permissions, final states, and pet status effects.
    - **Transactions:** a forced failure mid-acceptance is fully rolled back.
    - **Concurrency:** of two simultaneous acceptances, exactly one succeeds; and when the last two pending applications end at the same moment, the pet ends `available`.
    - **Pet deletion:** blocked while applications are active, cascading otherwise.
- **Auth:**
  - **Sessions:** server-side, stored in MongoDB, with an HttpOnly `sid` cookie (`SameSite=Lax`, `Secure` in production).
  - **Passwords:** Argon2id.
  - **Protections:** session id regenerated on login, login rate limiting (per IP; per IP + email for failures), and CSRF (`SameSite` plus the Origin check).
  - **Tests:** unchanged since step 4.
- **Web:**
  - **Pet list:**
    - **Controls:** a search box (300 ms debounce), species, status and sort selects, Previous/Next with "Page X of Y", and a result count.
    - **State:** kept in the URL (`useSearchParams`), so Back and shared links restore it. Any change other than the page resets to page 1.
    - **Loading:** `keepPreviousData` keeps the previous page on screen while the next one loads.
    - **Empty states:** "No pets yet", "No matches" with Clear filters, and a page number past the end.
    - **Cache:** query keys from `petQueryKeys` include every list parameter. Deleting a pet removes it from all cached pages and invalidates the lists.
  - **API client:** a `searchParams` option, and `Content-Type: application/json` only when there's a body. Before, every GET triggered an extra CORS preflight.
  - **Pet detail page:** a sign-in prompt for visitors, a "Review applications" link for the owner, an apply form for eligible users, or "Your application: status" with Withdraw.
  - **New `/applications` page:** "Applications for my pets" (applicant name and email, Accept/Reject while pending) and "My applications" (Withdraw while pending). Buttons come from the shared state machine (`getAllowedApplicationActions`).
  - **Identity changes:** every one (sign-in, sign-out, expired session) goes through `setCurrentUser`, which removes cached application data first.
  - **Tests:** 68 web tests.
- **E2E tests** (`apps/web-e2e`, Playwright, Chromium): 6 tests for 4 journeys.
  - **Registration and login:** register; sign in; wrong credentials.
  - **Browse and search:** public listing, name search, species filter.
  - **Apply:** a non-owner applies from the pet page; the application shows as pending.
  - **Owner:** sees the applicant's name and email, accepts, and the pet becomes adopted.
  - **Isolated stack:** Playwright starts the real API on port 3334 against a throwaway in-memory MongoDB replica set (`src/support/start-api.ts`), and the web app on port 4201 with `VITE_API_URL` pointing at it. Dev servers and dev data are never used, and each run starts with an empty database.
  - **No seed data:** tests create their own uniquely named users and pets through the API (`src/support/api.ts`).
- **Test infrastructure:**
  - **Database:** the API tests run against an in-memory **replica set** (`mongodb-memory-server`, started once in `test/global-setup.ts`), so transactions are real. `MONGODB_TEST_URI` is no longer used.
  - **Ordering:** spec files run sequentially. The database is dropped and re-indexed once per file, and documents are cleared between tests.

### Incomplete or not verified

- **No browser verification** of the application UI, the paginated pet and application lists, or the language selector.
- **Photo upload through Axios** is not verified in a browser (deferred to the manual QA checklist).
- No component tests for the register page or the user menu.
- Production settings (`Secure` cookies, `trust proxy`, a production replica set) are untested.

## Local MongoDB

**Set up 2026-10-20 (Docker option).**

- **Container:** `docker compose up -d` runs the single-node replica set `rs0` (container `pet-adoption-mongodb`, host port **27018**). The existing `pet-adoption-system_mongodb_data` volume was reused.
- **Configuration:** `apps/api/.env` now has `MONGODB_URI=mongodb://localhost:27018/pet-adoption?directConnection=true`.
- **Verified:** `rs.status()` reports PRIMARY, and the API's `connectDatabase`, including its replica-set check, connects.
- **The container's database starts empty.** The old local install on 27017, including its 2 ownerless pets, is untouched and no longer used. `MONGODB_TEST_URI` in `.env` is ignored.
- **Docker Desktop must be running** before you start the API. The container restarts automatically (`restart: unless-stopped`).
- **Since 2026-10-21:** `docker compose up -d` still starts only MongoDB. The API and web containers are behind the `app` profile (see README). The health check now waits until the node accepts writes, not just until the replica set is initiated.

## Design system foundation (2026-10-26, uncommitted)

- **Decision:** kept Tailwind 4 + shadcn/ui and did not add SCSS (Tailwind 4 isn't designed to run with Sass). Details, tokens and conventions are in [design-system.md](design-system.md).
- **Tokens:** a warm palette with a terracotta brand colour and success/warning/destructive tints, all checked for WCAG AA. Also radius, shadow and layout tokens (`max-w-page`, `page-container`). Files: `apps/web/src/styles/tokens.css`, `styles/base.css`.
- **Font:** Figtree, self-hosted through the new dependency `@fontsource-variable/figtree`. The old CSS referenced Inter but never loaded it.
- **Primitives:**
  - Updated: `Button` (40px default height, no `outline-none`), `Badge` (status variants), `Card` (new surface).
  - New: `Input`, `NativeSelect`, `Skeleton`, `PageHeader`, `StateMessage`, `PetStatusBadge`.
  - Global: a `:focus-visible` outline, reduced-motion support, and a skip link in the app shell.
- **Applied to:** the app shell (header and layout) and the pet list `/pets`:
  - a filter panel;
  - whole-card links;
  - skeleton loading, empty states, and an error state with retry.

  Also small consistency changes: status colours in `ApplicationStatusBadge` and the details page, and icons in `Pagination`. Other pages only pick up the new tokens.

- **Text:** new keys `pets.subtitle`, `pets.emptyHint`, `pets.noMatchingPetsHint`, `common.skipToContent` (en + sr). Removed `pets.viewDetails`, which the card no longer shows.
- **Checks:**
  - web lint, typecheck, test and build: ✅
  - E2E: ✅ 6/6
  - `/pets` screenshots at 375px and 1280px with a mocked API: no horizontal overflow, focus outline visible.
- Removed the unused `sass` devDependency.

## UX benchmark and Batch 1 (2026-10-26)

- **Research and roadmap:** [ux-benchmark.md](ux-benchmark.md) covers Battersea, Dogs Trust, RSPCA and Best Friends (observed) plus Petfinder (secondary; blocked).
- **Batch 1 (pet details and adoption decision), committed in `716adec`:**
  - details page: gallery + sticky adoption panel, 4:3 photos with a counter, fact tiles, "About" section, "How adoption works" steps, skeleton/not-found/error states;
  - application form: `Textarea` + `Label`, hint and character counter;
  - a sign-in button for visitors, and a notice when the pet is already adopted;
  - **Accept and Reject now ask for confirmation** (Withdraw doesn't);
  - shared `lib/format-date.ts`.
- **Checks:** web lint, typecheck and 98/98 tests ✅, build ✅, E2E 6/6 ✅ (owner flow updated to confirm), details-page screenshots at 375/1280 px.
- **Next:** Batch 2 (applications dashboard), then Batch 3 (forms: `FormField`, `pet-form-page`), as listed in the roadmap.

## Admin hardening: moderation, audit, rate limits (2026-10-27, uncommitted)

Closes the findings recorded after the admin feature; status per finding (A1–A6) is in [production-readiness.md](production-readiness.md).

- **Suspension:** `User.suspendedAt`; `suspendUser`/`reinstateUser`.
  - `requireAuth` reads role and suspension on every request; a suspended user's session is ended with 403 `ACCOUNT_SUSPENDED`. Sign-in says so after a correct password; `/auth/me` → 401.
  - Admins can't be suspended, and nobody can suspend themselves.
  - Accepting a suspended applicant's application → 409 `APPLICANT_SUSPENDED` (rejecting still works).
- **Listing moderation:** `Pet.hiddenAt`; `hidePet`/`restorePet` (lockPet first).
  - Hidden pets are out of the public list and return 404 except to the owner and admins. Pets now carry a `hidden` flag.
  - New applications → 404; existing applications and the state machine are unchanged; owners can't unhide.
- **Audit:**
  - Generalized entries (action, outcome succeeded/denied, actor, targetUser/targetPet, minimal metadata), created through `runAudited` in the same transaction as the change; refused attempts are recorded as `denied`.
  - List views with personal data are recorded (`users|pets|applications.viewed`: page, filters used, row count, never the search text).
  - Hash chain with `AUDIT_CHAIN_HEAD`, HMAC with optional `AUDIT_HMAC_KEY`, model hooks refuse updates and deletes, `pnpm audit:verify`.
  - New page `/admin/audit`.
- **Rate limits:** per admin account (session user id), 300 reads / 30 changes per 15 minutes → 429; in process memory.
- **CLI config:** `config/env-file.ts` (`loadEnvFile`, `readMongodbUri`, `readAuditKey`) is shared by `config/env.ts` and the CLIs. `admin:grant` and `audit:verify` need only `MONGODB_URI` (+ the key).
- **Web:**
  - `ConfirmAction` (inline confirmation, optional reason) replaces the role-only control.
  - Users page: status filter, Suspended badge, suspend/reinstate. Pets page: visibility filter, Hidden badge, hide/restore.
  - Audit log page; overview counts for suspended and hidden.
  - Pet page notice for hidden listings; `ACCOUNT_SUSPENDED` signs the web user out.
  - Admin tabs wrap on phones (they were cut off). en + sr.
- **Config/docs:** `AUDIT_HMAC_KEY` in both `.env.example` files and passed through in `docker-compose.yml`. Updated requirements, architecture (§2b, §3c, §4, §5b), deployment, design system, README, CLAUDE.md.
- **Tests:**
  - API: `admin-moderation.spec.ts` (+22: rate limits incl. spoofed headers, audit access/content/denied/append-only/chain/HMAC, suspension incl. sessions/sign-in/applications/races, moderation incl. owner bypass, CLI with only `MONGODB_URI`).
  - Web: +8 (suspension, moderation, audit page, hidden notice).
  - E2E: `admin-moderation.spec.ts` (+1: suspend a signed-in member, hide a listing, audit log).
- **Checks (2026-10-27):**
  - lint, typecheck and build for all 4 projects: ✅
  - tests (`--parallel=1`): ✅ web 122/122, API 305/305
  - E2E: ✅ 9/9 in one full run
- **Browser verification:** Chromium at 1280 and 375 px against the real API and web app from source, with an in-memory database seeded by the demo seed and an admin made by the real `admin:grant` (only `MONGODB_URI` set).
  - Every admin page; the loading (delayed), error (forced network failure + retry) and empty states; audit pagination (26 entries); role change and revert; suspend with a reason; a suspended sign-in; reinstate; hide (public search returns 0) and restore; the forbidden page for a non-admin.
  - No horizontal overflow; console errors were only the expected 401 `/auth/me` before sign-in, the suspended user's 403 and the forced network failures; `audit:verify` reported the chain intact (HMAC).
  - Script: `scratchpad/verify-admin.mjs` (not committed).
  - **Not done:** the same check against the developer's own dev database (Docker Desktop wasn't running). To repeat it there:
    1. `docker compose up -d` and start `pnpm nx serve @pet-adoption/api` and `pnpm nx dev @pet-adoption/web`;
    2. `pnpm dev:seed` (if not seeded);
    3. `pnpm admin:grant luka@demo.example.com --yes`;
    4. sign in at http://localhost:4200 as luka (`demo-password`) and go through Admin → Overview, Users (search, role change, suspend with a reason, reinstate), Pets (hide, restore), Applications, Audit log; then sign in as marko and open /admin (expect "Admins only");
    5. `pnpm audit:verify`.

## Admin role and administration area (2026-10-27, uncommitted)

- **Roles:** `user` (default) and `admin` (`USER_ROLES`, `User.role`). No shelter role: posting pets is open to every signed-in user and ownership stays per pet. Users stored before roles read as `user`.
- **API** (`apps/api/src/admin/`):
  - `requireAdmin` (in `auth/require-auth.ts`) is mounted on the whole `/api/admin` router. It reads the role from MongoDB on every request, so it denies by default and role changes apply on the next request.
  - Endpoints: `GET stats`, `GET users`, `PUT users/:id/role`, `GET pets`, `GET applications`.
  - Pets and applications are read-only; there is no bypass of ownership or the adoption state machine.
  - `changeUserRole` runs in one transaction with a guard document (serializes role changes), refuses changes to one's own role and to the last admin, and writes an audit entry (`adminaudits`).
- **Provisioning:** `pnpm admin:grant|revoke <email> [--yes]` (`scripts/admin-role.ts`; a dry run without `--yes`). Registration ignores `role`. Procedure in the README ("Administrators").
- **Web** (`features/admin`):
  - `/admin` overview (counts, recent admin activity), Users (search, role filter, role change with inline confirmation; one's own role can't be changed), Pets, Applications. URL-kept filters, skeleton/empty/error states.
  - The header's Admin link is shown for admins only. `AdminLayout` handles loading, sign-in redirect and "Admins only".
  - An `ADMIN_REQUIRED` response refetches `/auth/me`; admin caches are cleared on every identity change. en + sr.
- **E2E:** the in-memory MongoDB uses fixed port 27031 so `support/admin.ts` can run the real `admin:grant`. `admin.spec.ts` covers the admin journey and an ordinary user being refused (UI and API).
- **Small refactors for reuse:** `toPetView` moved to `pets/pet-view.ts`; `escapeRegex` exported; `listAllApplications` added to `application.service.ts`.
- **Tests:** API +39 (`admin.controller.spec.ts` 34, `admin-role.spec.ts` 5; `auth.controller.spec.ts` now expects `role`); web +12 (`admin-pages.spec.tsx`).
- **Checks (2026-10-27):**
  - lint, typecheck and build for all 4 projects: ✅
  - tests (`--parallel=1`): ✅ web 114/114, API 283/283
  - E2E: ✅ 8/8 in one full run, including both admin journeys
  - Two bugs were found by the tests and fixed before these runs: the stats aggregation grouped on a literal instead of `$status`, and the role-change guard is now created outside the transaction (a first-ever concurrent change could otherwise fail with a duplicate key).
- **Not verified:** the admin pages in a real browser against the dev database (only through E2E and component tests).
- **Findings for the roadmap:** see "Findings from the admin work" in [production-readiness.md](production-readiness.md) (admin reads not audited, no suspension, audit log not tamper-proof).

## Empty pet list in development (2026-10-26, uncommitted)

**Cause:** the API returned 200 with no pets, for two separate reasons, neither of them a regression.

1. **The development database `pet-adoption` was never seeded.** It had 0 pets and 0 users. The MongoDB oplog, which covers the container's whole life since 2026-10-20, shows only collection and index creation there, no document writes. The 14 demo pets live in `pet-adoption-demo` (`pnpm demo:start`, ports 3335/4202). The only way to seed dev was a buried README line.
2. **The Docker app stack was running** (`pet-adoption-api` on 3333, `pet-adoption-web` on 4200, images from 2026-10-21).
   - `nx serve @pet-adoption/api` crashed with an unhandled `EADDRINUSE` on 3333.
   - Vite silently moved to 4201, which the API's CORS (`http://localhost:4200`) rejects.
   - Requests to `localhost:3333` reached the stale Docker API, which reads the same empty database. Proof: it rejects `species=rabbit`.

Batch A and the list filters were ruled out: the pet list applies no default filter.

**Fixes:**
- `listen.ts` makes a taken port a clear startup error;
- `strictPort` on the Vite dev and preview servers;
- `pnpm dev:seed` (`seed-demo.ts --dev`, a fixed target `http://localhost:3333/api`) refuses an API that rejects the seed's species (i.e. an older build);
- the README documents the empty dev database, `dev:seed`, and that options A and B share ports, database and (not) photos.
- Tests: `listen.spec.ts` (+2), `demo-config.spec.ts` (+4).

**Verified against the real environment:**
- with the owner's approval, the Docker `api` and `web` containers were stopped (MongoDB kept running);
- the owner's `nx serve` restarted on a rebuild, and `pnpm dev:seed` added 4 users, 14 pets (5 species, 11 with photos) and 13 applications to `pet-adoption`;
- `GET /api/pets` returns 14;
- a browser on http://localhost:4200 (current Vite, strict port) shows "14 pets found" with no broken images;
- `pet-adoption-demo` is unchanged.
- Restart the Docker stack later with `docker compose --profile app start` (after stopping the dev servers).

**Production readiness:** assessed in [production-readiness.md](production-readiness.md) (P0 launch blockers, P1, decisions D1–D4).

## Batch A: more species and richer pet profiles (2026-10-26, uncommitted)

Plan for the rest of the pre-admin work: [ux-benchmark.md §6](ux-benchmark.md#6-pre-admin-plan-2026-10-26) (B lifestyle filters → C applications dashboard → D forms/apply polish).

- **Species:** `dog, cat, rabbit, bird, rodent, other` (shared `PET_SPECIES`, so the API enum, filters and form follow).
- **Profile facts** (shared `PetProfile`): `sex` (male/female/unknown), `breed` (optional text, ≤ 60), `compatibility.{children,dogs,cats}` (yes/no/unknown), `aloneTime` (short/part-day/full-day/unknown).
  - API: optional in `createPetSchema` with defaults (zod `default`/`prefault`), so existing clients still work; PUT resets omitted facts to their defaults (it replaces the whole pet). Mongoose fields have the same defaults.
  - Old documents: no migration; `withProfileDefaults` (`pet.model.ts`) fills missing facts in every pet response.
- **Web:**
  - the pet form is grouped into "Basics" and "Home and lifestyle" fieldsets and uses `Input`/`NativeSelect`/`Textarea`/`Label`;
  - the details page has sex/breed fact tiles (only when known) and a "Home and lifestyle" list (`pet-lifestyle.tsx`);
  - cards show sex and "Good with …" chips for confirmed answers;
  - en + sr texts.
- **Demo data:** Kiki is a bird, Coco a rabbit, Pip a rodent; every demo pet has facts. Existing demo databases keep their old pets (the seed doesn't update existing ones); run `pnpm demo:reset` to re-seed.
- **Tests:** API +6 (facts stored and returned, defaults, partial compatibility, old documents, validation, PUT reset); web +4 (details facts and lifestyle, unknown facts hidden, edit form loads and sends facts, card sex and chips).
- **Checks:**
  - lint + typecheck, all 4 projects: ✅
  - web tests: ✅ 102/102
  - build (web + API): ✅
  - API tests: 236/238 in the full run. The 2 failures were a 5 s timeout in an existing PUT test plus a 409 caused by it (the timed-out sign-up finished late). The pet spec then passed 58/58 with `--testTimeout=30000`. Cause: the owner's dev servers were rebuilding on every save, which slows Argon2 hashing.
  - E2E: 5/6 in the full run, then the failed spec (`adoption-application`) passed on its own. The first failure's cause wasn't captured; load is likely.
  - E2E ran on temporary ports 4211/3344, because the owner's `nx dev` web server sat on 4201 (Docker web uses 4200). The port change was reverted.
  - Screenshots: list, details and form at 375/1280 px, no horizontal overflow.
- **Not verified:** a real browser against the real API and a re-seeded demo database.

## Docker QA environment (2026-10-23, uncommitted)

- **What:** `docker-compose.qa.yml`, a separate Compose project `pet-adoption-qa` for manual QA. It has its own MongoDB server (database `pet-adoption-qa`), network and volumes (`pet-adoption-qa_mongodb_data`, `_mongodb_config`, `_uploads_data`), and runs the same Dockerfiles. Ports are bound to 127.0.0.1: web 4203, API 3336, MongoDB 27019. It needs `QA_SESSION_SECRET` in the root `.env` and refuses to start without it.
- **Scripts:**
  - `pnpm qa:up|ps|logs|down` go through `qa-compose.ts`, which always passes `-f docker-compose.qa.yml -p pet-adoption-qa` and refuses options such as `-v`.
  - `pnpm qa:seed` (`seed-demo.ts --qa`) seeds exactly `http://127.0.0.1:3336/api`. `pnpm demo:seed` keeps its old behaviour but refuses the QA port.
  - `pnpm qa:reset` is a dry run by default. With `--yes` it empties the QA database and photo volume after checking the project, container names, running state, mounted volumes and configured database. It never deletes volumes.
- **Why 127.0.0.1:** browsers keep cookies per host name, not per port, so on `localhost` every environment's `sid` cookie collided. On `127.0.0.1` the QA sign-in stays separate.
- **Verified 2026-10-23** (with a temporary QA secret passed only to my commands; your `.env` was not changed):
  - the resolved config was checked before starting
  - `docker inspect`: the QA containers mount only QA volumes, are only on the QA network, and the API's database is `mongodb:27017/pet-adoption-qa`
  - the QA server holds only `pet-adoption-qa` besides MongoDB's system databases
  - seeding: 14 pets, 23 photos; a rerun added nothing
  - a user upload of 2 photos stored and served
  - a write from `localhost:4203` is refused (403 `UNTRUSTED_ORIGIN`)
  - nginx deep links (`/pets/<id>`, `/applications`) are served
  - reset: the dry run deleted nothing; `--yes` emptied the QA data, kept indexes and volumes; reseeding works
  - data survives `qa:down` + `qa:up`
  - the guards refuse `qa:down -v`, extra Compose options, a reset without QA containers, `qa:seed` with a foreign `DEMO_API_URL`, and `demo:seed` against the QA port
- **Other environments unchanged:** a read-only snapshot before and after showed dev `pet-adoption` empty, demo `pet-adoption-demo` with 4 users / 14 pets / 13 applications / 4 sessions, no photos in the main volume, `tmp/demo-uploads` or `apps/api/uploads`, and the same main volumes. No `pet-adoption-qa` database exists on the dev server.
- **Limitations:**
  - `host.docker.internal` and `gateway.docker.internal` are mapped to the QA containers' own loopback (blocked). The dev MongoDB's published port 27018 is still reachable from QA containers by raw IP (the QA network gateway 172.19.0.1 and Docker Desktop's host IP 192.168.65.254). Isolation relies on the fixed QA connection string, the guarded scripts and these checks, not on network blocking. Closing it would need the main stack to stop publishing 27018 on all interfaces.
  - Before the config volume was named, three empty, unused, unnamed volumes were left from today's QA test runs. They were not deleted: `201a1e8b717e…`, `7ddb7bdc08e4…`, `d8796b411109…` (full names in the session report).

## Multiple photos (2026-10-22)

- **Data and API:**
  - A pet has up to 5 photos (`images: [{ _id, key }]`, `PET_IMAGE_MAX_COUNT`). Responses have `images: [{ _id, url }]` plus `imageUrl` (the first photo), so cards and older clients keep working.
  - `POST /api/pets/:id/images` adds 1–5 files (field "images"); all are stored or none. `DELETE /api/pets/:id/images/:imageId` removes one.
  - The limit is checked before the body is read, and again atomically in the update query, so simultaneous uploads can't exceed it. New error codes: 409 `TOO_MANY_IMAGES`, 404 `IMAGE_NOT_FOUND`.
  - `PUT`/`DELETE /api/pets/:id/image` still work: they replace all photos with one, or remove all.
  - **Old records:** pets with the old single `imageKey` are converted at API startup (`backfillPetImages`, a no-op once done).
- **Files:** new files are written before the database update and removed again if it fails or matches nothing. Files are deleted only after the database stops referencing them, and keys are never reused. Deleting a pet deletes all its photos.
- **Web:**
  - **Form:** existing photos and new previews as tiles with per-photo Remove buttons, "Add photos" (several files at once), per-file type/size messages, and the 5-photo limit counting existing photos. Saving runs the pet update, then the removals, then one upload; if a photo step fails, the pet stays saved.
  - **Detail page:** a gallery with keyboard-accessible thumbnails.
  - **Cards:** unchanged (`imageUrl`).
- **Demo photos:**
  - `apps/api/src/scripts/demo-images/mapping.json` lists which downloaded image (`cat.*`/`dog.*`) becomes which pet's photo.
  - `pnpm demo:images` copies them to `max.jpg`, `max-2.jpg`, …: originals kept, never overwrites, rerun-safe, species checked.
  - `pnpm demo:seed` uploads all of a pet's photos in one request, only to pets without photos.
  - The default mapping gives 11 pets 23 photos; Kiki, Coco and Pip (budgie, rabbit, hamster) have none, as no images of those animals exist.
- **Checks (2026-10-22):**
  - lint, typecheck, test and build for all 4 projects: ✅ web 95, API 194 (photo API +16, demo images 27)
  - E2E: ✅ 6/6
  - `pnpm demo:images`: ✅ copied 23 files; the rerun copied 0
  - seed against a throwaway in-memory MongoDB on a separate port: ✅ 23 photos uploaded and served; the rerun added none
- **Not verified:**
  - the new UI in a real browser (UPL-001, UPL-002, UPL-005, UPL-006 in the QA checklist)
  - photos on the real demo database
  - the Docker volume with several photos (DOCKER-004)
- **Note:** a `pnpm demo:start` that was already running uses the old API code; restart it before seeding.
- **Images:** the downloaded images are at most 500 px wide, so they look soft in the wide gallery view. The 270 originals (6.6 MB, licence confirmed by the owner) are committed with the 23 prepared copies, so `pnpm demo:images` can be rerun after editing `mapping.json`.

## Changes in commit `060eb5d` (2026-10-21)

- **CI:** `.github/workflows/ci.yml` runs `lint typecheck test build` for every project on pushes and pull requests to `master` and `develop` (Node 22, pnpm 12.3.4, pnpm store and MongoDB binary caches). The API tests' required variables are set in the workflow, because `apps/api/.env` is not in Git; the tests still use the in-memory replica set. **E2E is not in CI yet** (possible later: a second job running `nx e2e` with Playwright's Chromium installed).
- **Application lists paginated** (API and web): `page`/`pageSize` (default 10, max 50), newest first with `_id` tie-breaker, `Paginated<T>` responses, `VALIDATION_FAILED` for bad parameters.
  - **`petOwner` on applications:** copied from the pet on submit, indexed with the list order, so `/received` no longer loads all of the owner's pet ids. Existing applications get it at API startup (`backfillApplicationPetOwners`, a no-op once done).
  - **`/mine?pet=<id>`:** the pet page now asks only for its pet's newest application (`pageSize=1`) instead of the user's whole list.
  - **Web:** each list on `/applications` pages independently (`?receivedPage=`, `?minePage=`, invalid values → 1), keeps the previous page on screen while loading, and offers "Go to the first page" past the end. Pagination controls are a shared `components/pagination.tsx` (the pet list uses it too; its labels moved to `common:pagination.*`).
- **Edit form load errors:** `PET_NOT_FOUND` / `INVALID_PET_ID` still show "Pet not found"; network, server and other errors show their translated message with "Try again" and "Back to pets".
- **Language selector** in the header (English / Srpski). The choice is saved in `localStorage` (falls back to English if unavailable or invalid) and sets `<html lang>`. The header title is now translated. Forms now store validation keys and translate on render, so messages already on screen switch language too (login, register, pet form, application form).
- **`env.ts`:** checked and left unchanged (see "Other outstanding issues").
- **Docs:** README rewritten for portfolio readers (highlights, stack, screenshot placeholders, CI badge, limitations); new [deployment.md](deployment.md); requirements, architecture and `CLAUDE.md` updated.
- **Branches:** GitHub's default branch is `master`, which still holds only the Nx scaffold (`5bd296a`). It is an ancestor of `develop`, so `master` can be fast-forwarded to `develop` without a merge commit or force-push. Not done yet: waiting for a green CI run on `develop` and the owner's approval.

**Check results:**

| Check                                                                                                             | Result                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `nx run-many -t lint typecheck test build` (all 4 projects, no cache, `.env` loading disabled, CI variables only) | ✅ web 89/89 tests, API 151/151 tests, builds OK                                                                                       |
| `nx e2e @pet-adoption/web-e2e`                                                                                    | ✅ 6/6                                                                                                                                 |
| CI workflow on GitHub                                                                                             | ⏳ `develop` pushed; result not checked (the repository is private and `gh` isn't installed here, so the owner checks the Actions tab) |
| Workflow YAML                                                                                                     | Parsed locally with `js-yaml`; not validated by GitHub yet                                                                             |

**Not verified:** the new UI in a real browser by hand (pagination controls, language selector, edit-form errors); E2E covers only the original journeys.

## Axios switch (2026-10-21)

- **The owner's decision:** replace the `fetch` wrapper with Axios. This follows an evaluation that found the wrapper sufficient; the change was made by preference, to use a widely used library and interceptor pattern.
- **Dependency:** `axios` `~1.20.0` (released 2026-08-26, the current `latest`). It was chosen deliberately after the 2026 axios npm account compromise. Its dependencies were checked (follow-redirects, form-data, https-proxy-agent, proxy-from-env), and the malicious `plain-crypto-js` from the incident is not in the lockfile.
- **`apps/web/src/lib/api-client.ts`:**
  - The `http` Axios instance (`baseURL`, `withCredentials`).
  - A response interceptor (`toApiError`) that keeps the same `ApiError` contract: the API's `{ code, details }`, `INTERNAL_SERVER_ERROR` for unexpected bodies, and `NETWORK_ERROR` when there's no response. Cancellations pass through unchanged.
  - The manual JSON/`Content-Type`/query-string/204 code is gone (Axios handles it).
- **API functions** (15 calls in `features/*/api`) now use `http.get/post/put/delete` with plain objects and return `data`.
- **Unchanged:** the 401 sign-out, retries and toasts stay in `app/query-client.ts`. They need the query cache, and importing it into the interceptor would create a circular import.
- **Tests:** `lib/api-client.spec.ts` and `get-current-user.spec.ts` replace the transport through `http.defaults.adapter` (helper `lib/testing/mock-http-adapter.ts`) instead of stubbing `fetch`.

## Check results (Axios switch)

| Check                               | Result                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Web lint, typecheck and tests       | ✅ 75/75 (the client spec now has 9 tests, including cancellation)                                            |
| Web production build                | ✅ main chunk 567 kB / 176 kB gzipped (size before the switch not measured in this session)                   |
| `pnpm nx e2e @pet-adoption/web-e2e` | ✅ 6/6: register, login, wrong login (401), browse/search, apply, accept, all through Axios in a real browser |

**Not run:**

- A browser check of the **photo upload** (`FormData` through Axios). Unit tests mock that call, and E2E doesn't upload.
- The API suites (no API code changed).

**Also:** deleted the stale `apps/api/dist` (gitignored build output from an earlier `prune`), which made `vite-tsconfig-paths` print parse warnings.

## Demo data

- **Scripts** in `apps/api/src/scripts/`, run with `pnpm demo:start`, `pnpm demo:seed` and `pnpm demo:reset [--yes]` (README, "Demo data").
- **Isolated:** its own database `pet-adoption-demo` on the dev MongoDB, photos in `tmp/demo-uploads`, ports 3335/4202. The seed creates 4 users, 14 pets and 13 applications **through the HTTP API**, and can be rerun safely: it checks what exists first and reports data changed by hand.
- **Safety guards:**
  - reset only touches databases ending in `-demo`, and only deletes after `--yes`
  - neither script touches `apps/api/uploads`
  - the seed refuses port 3333 without `--allow-port-3333`
- **Verified 2026-10-21** against a throwaway in-memory MongoDB, never the dev database:
  - first seed: 31 items; two reruns: 0 new
  - recovery after a partial seed reports the drift
  - all three guards work, and the reset dry run deletes nothing
  - the API shows 14 pets on 2 pages, Ana with 11 received applications on 2 pages, and statuses as designed
  - a test photo was uploaded and served
- **Not verified:** `pnpm demo:start` against the real MongoDB on 27018, and seeding a Docker stack. Stopping `demo:start` other than with Ctrl+C (e.g. killing the parent process) can leave the two child processes running.

## Deployment

Not deployed. Requirements for a future deployment (same-site cookies, HTTPS, `trust proxy`, env vars, CORS/CSRF, photo storage, shared rate-limit storage) are in [deployment.md](deployment.md). In development, photos go to `apps/api/uploads/` (gitignored) and need no configuration.

## Security considerations still open

- **Pet photos:**
  - **Metadata is kept.** Photos are stored as uploaded, so camera metadata (EXIF, which may include GPS location) isn't removed, and files aren't re-encoded. Stripping it would need an image library such as `sharp` (a native dependency).
  - **Polyglot files:** the magic-byte check plus `nosniff` and a fixed extension keep a disguised file from being treated as HTML or script, but it doesn't prove the file is a valid image.
  - **Memory:** uploads are buffered in memory (5 MB each).
  - **No per-user upload rate limit.**
  - **Possible orphans:** a crash between writing a file and updating the database could leave an orphaned file; there's no cleanup job.

- **Rate limiting:**
  - The counters are in memory, so they reset on restart and aren't shared between instances.
  - Distributed credential stuffing is only slowed, not stopped.
  - Users behind one shared IP share the per-IP budget.
  - `trust proxy` must be correct in production.
- **Registration reveals whether an email exists** (409).
- No email verification, password reset, "log out other sessions", or `argon2.needsRehash` upgrade path.
- **Fixed session lifetime:** 7 days from login, with no idle timeout.
- **Applicant emails** are visible to the owners of pets they applied for, by design. There is no way to hide or revoke that.
- **Production:**
  - HTTPS for `Secure` cookies.
  - `trust proxy` matching the real setup.
  - Serving web and API from the same site, or else switching to `SameSite=None` plus CSRF tokens.
  - A replica set (or a managed MongoDB, which normally is one).

## Other outstanding issues

- **Imports and dependencies:**
  - Imports mix `@/…` and relative paths.
  - ~~`sass` appears unused.~~ Removed 2026-10-26.
  - Peer-dependency warnings from `pnpm install` were not investigated.
- `env.ts` resolves `.env` relative to the working directory. **Checked 2026-10-21 and left as is:** Nx loads `apps/api/.env` into its tasks itself, E2E starts the API from the repo root, and Docker passes the variables directly, so every documented workflow works. A file-relative path would differ between `src/` and the bundled `dist/main.js`.
- React Router v6 future-flag warning. Two moderate React Router advisories are only fixed in v7 (see production-readiness.md §6); plan the v7 upgrade.
- **Applications whose applicant account is deleted** aren't handled; there's no account deletion yet.

## Roadmap (agreed priority)

1. ~~Fix basic checks and fresh-clone installation.~~ Done.
2. ~~Shared pet types; standardized API error responses.~~ Done.
3. ~~Complete pet management.~~ Done.
4. ~~Users and authentication.~~ Done.
5. ~~Pet ownership and authorization.~~ Done.
6. ~~Adoption applications and their lifecycle.~~ Done.
7. ~~Server-side filtering, searching and pagination.~~ Done for the pet list and both application lists.
8. Later: OAuth/OIDC sign-in (Google/GitHub) and cloud deployment. (Image uploads, Playwright E2E tests and local Docker Compose are done.)

## Next task

0. **Production readiness first** ([production-readiness.md](production-readiness.md)): P0-1 and P0-3 are done (2026-10-27, uncommitted; details in its §6). Next: P0-2 (image re-encoding), then P0-8, P0-9, P0-10 (order in its §5). Batch B waits until these are done. Hosting, email, error-tracking and legal decisions (D1–D4) are needed before P0-4/6/7.
1. **Manual QA on Docker QA** ([manual-qa-checklist.md](manual-qa-checklist.md)): add `QA_SESSION_SECRET` to the root `.env`, `pnpm qa:up`, `pnpm qa:seed`, open http://127.0.0.1:4203, then the smoke suite (UPL-001 checks real multi-photo upload through Axios), UPL-002, UPL-005, UPL-006, then the release and Docker suites. Record the results in `docs/manual-qa-log.csv`.
2. **Check that the CI run for `060eb5d` passed on GitHub** (Actions tab). Then fast-forward `master` to `develop` (see "Changes in this session") so the default branch shows the project.
3. Add screenshots to the README (instructions are in the README).
