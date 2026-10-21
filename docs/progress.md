# Progress

_Last updated: 2026-10-21. Branch `develop`, latest commit `6a89205` (documentation). Uncommitted on top: GitHub Actions CI, paginated application lists, language selector, edit-form load errors, README and deployment notes (see "Changes in this session")._

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
- **Pet photos** (one per pet; replaces the old "image URLs" field):
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

## Changes in this session (2026-10-21, uncommitted)

- **CI:** `.github/workflows/ci.yml` runs `lint typecheck test build` for every project on pushes and pull requests to `master` and `develop` (Node 22, pnpm 12.3.4, pnpm store and MongoDB binary caches). The API tests' required variables are set in the workflow, because `apps/api/.env` is not in Git; the tests still use the in-memory replica set. **E2E is not in CI yet** (possible later: a second job running `nx e2e` with Playwright's Chromium installed).
- **Application lists paginated** (API and web): `page`/`pageSize` (default 10, max 50), newest first with `_id` tie-breaker, `Paginated<T>` responses, `VALIDATION_FAILED` for bad parameters.
  - **`petOwner` on applications:** copied from the pet on submit, indexed with the list order, so `/received` no longer loads all of the owner's pet ids. Existing applications get it at API startup (`backfillApplicationPetOwners`, a no-op once done).
  - **`/mine?pet=<id>`:** the pet page now asks only for its pet's newest application (`pageSize=1`) instead of the user's whole list.
  - **Web:** each list on `/applications` pages independently (`?receivedPage=`, `?minePage=`, invalid values → 1), keeps the previous page on screen while loading, and offers "Go to the first page" past the end. Pagination controls are a shared `components/pagination.tsx` (the pet list uses it too; its labels moved to `common:pagination.*`).
- **Edit form load errors:** `PET_NOT_FOUND` / `INVALID_PET_ID` still show "Pet not found"; network, server and other errors show their translated message with "Try again" and "Back to pets".
- **Language selector** in the header (English / Srpski). The choice is saved in `localStorage` (falls back to English if unavailable or invalid) and sets `<html lang>`. The header title is now translated. Forms now store validation keys and translate on render, so messages already on screen switch language too (login, register, pet form, application form).
- **`env.ts`:** checked and left unchanged (see "Other outstanding issues").
- **Docs:** README rewritten for portfolio readers (highlights, stack, screenshot placeholders, CI badge, limitations); new [deployment.md](deployment.md); requirements, architecture and `CLAUDE.md` updated.
- **Branches:** GitHub's default branch is `master`, which still holds only the Nx scaffold (`5bd296a`). It is an ancestor of `develop`, so `master` can be fast-forwarded to `develop` without a merge commit or force-push. Not done yet: it needs these changes committed and pushed first, and the owner's approval.

**Check results:**

| Check | Result |
|---|---|
| `nx run-many -t lint typecheck test build` (all 4 projects, no cache, `.env` loading disabled, CI variables only) | ✅ web 89/89 tests, API 151/151 tests, builds OK |
| `nx e2e @pet-adoption/web-e2e` | ✅ 6/6 |
| CI workflow on GitHub | ⏳ not run yet (nothing pushed) |
| Workflow YAML | Parsed locally with `js-yaml`; not validated by GitHub yet |

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

| Check | Result |
|---|---|
| Web lint, typecheck and tests | ✅ 75/75 (the client spec now has 9 tests, including cancellation) |
| Web production build | ✅ main chunk 567 kB / 176 kB gzipped (size before the switch not measured in this session) |
| `pnpm nx e2e @pet-adoption/web-e2e` | ✅ 6/6: register, login, wrong login (401), browse/search, apply, accept, all through Axios in a real browser |

**Not run:**
- A browser check of the **photo upload** (`FormData` through Axios). Unit tests mock that call, and E2E doesn't upload.
- The API suites (no API code changed).

**Also:** deleted the stale `apps/api/dist` (gitignored build output from an earlier `prune`), which made `vite-tsconfig-paths` print parse warnings.

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
  - `sass` appears unused.
  - Peer-dependency warnings from `pnpm install` were not investigated.
- `env.ts` resolves `.env` relative to the working directory. **Checked 2026-10-21 and left as is:** Nx loads `apps/api/.env` into its tasks itself, E2E starts the API from the repo root, and Docker passes the variables directly, so every documented workflow works. A file-relative path would differ between `src/` and the bundled `dist/main.js`.
- React Router v6 future-flag warning.
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

1. **Manual QA in the browser** (checklist still to be written): register, post a pet with a photo (this also verifies photo upload through Axios), browse/search/page, apply, accept/reject/withdraw, page both application lists, switch language and reload.
2. **Commit, push `develop`, and check that the CI run passes on GitHub.** Then fast-forward `master` to `develop` (see "Changes in this session") so the default branch shows the project.
3. Add screenshots to the README (instructions are in the README).
