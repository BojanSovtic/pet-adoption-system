# Progress

_Last updated: 2026-10-19. Roadmap steps 1–2 and centralized error handling completed (all uncommitted, on branch `develop`)._

## Status

### Completed and verified

Verified by passing tests or by reading the code.

- **API endpoints:** `GET /api/health`, `GET /api/pets`, `GET /api/pets/:id`, `POST /api/pets`, `PUT /api/pets/:id`. Covered by 14 supertest integration tests against a real test DB.
- **API errors:** every error response is `{ code, details? }`:
  - Invalid id → 400 `INVALID_PET_ID`; missing pet → 404 `PET_NOT_FOUND`.
  - Invalid body → 400 `VALIDATION_FAILED` with `details: [{ field, code }]` (zod issue codes; array items as `imageUrls.1`).
  - Malformed JSON → 400 `INVALID_JSON` (was a 500 before).
  - Anything else → 500 `INTERNAL_SERVER_ERROR`, the only case that gets logged.
  - Zod strips unknown fields, so `status` cannot be set by clients.
- **Shared library** `@pet-adoption/models`: `Pet`, `CreatePetInput`, `UpdatePetInput`, `PET_SPECIES`, `PET_STATUSES`, length limits, `ApiErrorResponse`, `ValidationIssue`. Used by the API (Mongoose model, zod schemas checked with `satisfies`, service, controller) and the web (API functions, form, filters, select options). Bundled inline into the API build.
- **Web error handling:** see "Error handling" in `CLAUDE.md` for who does what. Covered by unit tests: `api-client.spec.ts`, `get-error-message.spec.ts`, `query-client.spec.ts`.
- **Web pages:** pet list with client-side search and filters (`filterPets`), details page, create/edit form with client-side zod validation plus server field errors shown under the inputs.
- **i18n:** pluralization, the global error key, error codes and validation-code translations in `en` and `sr`.

### Incomplete or not verified

- No browser verification of any UI change from steps 1–2: inline form errors, toasts, select options, network-error message.
- No component tests for pages or the form.
- The API server was not started after the workspace change. The bundle contains the shared code inline, but `nx serve` itself was not run.
- Not started: delete, status changes, users/auth, ownership, adoption applications, pagination/server-side filtering, image upload, e2e tests, deployment.

## Changes in this session

**Step 1 (checks and fresh clone):**
- Added `clsx` and `tailwind-merge` to the repo and removed `cn`.
- `nx sync`.
- Fixed i18n plurals and keys.
- Fixed `index.html`.
- `returnDocument: 'after'` instead of `new: true`.
- API build/typecheck conflict fixed with `skipTypeCheck` on the build and tsc output moved to `apps/api/out-tsc/`.
- `.gitignore` additions.

**Centralized error handling (web):**
- `apiClient` normalizes all failures into `ApiError`, including network errors and non-JSON error bodies.
- `QueryClient`:
  - No retry on 4xx.
  - Toasts only for mutation errors and background refetch failures (removes duplicate toast + inline errors).
  - Typed `meta`.
- `getErrorMessage` and `getFieldErrors` helpers.
- The list page no longer shows raw error codes.

**Step 2 (shared types and API errors):**
- **Workspace linking:** `pnpm-workspace.yaml` was missing `packages:`, so the shared lib could not be imported at all. Added it, `workspace:*` deps, and `apps/web/package.json`.
- **Shared library:** removed the placeholder `Product` model.
- **API errors:**
  - `ValidationError` and an `AppError.details` field.
  - `validateBody` forwards errors to the error handler.
  - The handler serializes `ApiErrorResponse` and handles malformed JSON.
- **Web typecheck config:** once `apps/web/tsconfig.app.json` had a project reference, Nx switched web typecheck to `tsc --build`, which exposed a broken `tsconfig.spec.json`. Added DOM lib, JSON support and separate `out-tsc/` folders.

**Decisions:**
- Zod schemas are not shared. The form schema differs (string inputs), so only types and constants live in the shared lib.
- The API sends codes, not display text.

## Check results (2026-10-19)

Command: `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build --skipNxCache`, run without `--skipSync`.

| Project | lint | typecheck | test | build |
|---|---|---|---|---|
| api | ✅ | ✅ | ✅ 14/14 | ✅ |
| web | ✅ no warnings | ✅ | ✅ 24/24 | ✅ |
| models | ✅ | ✅ | none | n/a |

Also checked:
- `prettier --check` on changed files passes.
- No Mongoose deprecation warning.
- `nx sync:check` is clean.

`pnpm install` prints peer-dependency warnings, which were not investigated.

## Outstanding issues

Bugs (confirmed):

1. Editing cannot clear all image URLs: the form omits an empty `imageUrls`, and `PUT` is a partial update.

Inconsistencies and risks:

- `PUT` behaves like `PATCH` (`createPetSchema.partial()`).
- Routing and navigation:
  - `app-shell.tsx` uses `<a href>` instead of `<Link>`, which causes a full page reload.
  - There is no `/` route and no 404 route.
- `apiClient` always calls `response.json()`. A `204 No Content` response (e.g. a future DELETE) needs handling.
- Imports mix `@/…` and relative paths.
- `sass` is installed but appears unused.
- `env.ts` requires `MONGODB_TEST_URI` even outside tests and resolves `.env` relative to the working directory.
- Possible test flakiness (not observed):
  - Both API spec files share one test DB and drop it after each test while running in parallel.
  - The "returns all pets" ordering test depends on `createdAt` and may flip when two pets share a millisecond.

## Roadmap (agreed priority)

1. ~~Fix basic checks and fresh-clone installation.~~ Done.
2. ~~Shared pet types; standardized API error responses.~~ Done (plus centralized web error handling).
3. Complete pet management: decide PUT vs PATCH, add deletion, root route and 404 page.
4. Users and authentication.
5. Pet ownership and authorization.
6. Adoption applications and their lifecycle (available → pending → adopted).
7. Server-side filtering, searching and pagination when appropriate. Auth headers and 401 handling go into `apiClient` / `QueryClient` when step 4 needs them.
8. Later: image uploads, Playwright e2e tests, Docker and deployment.

## Next task: complete pet management (roadmap step 3)

Prerequisites:
- The owner reviews and commits the current changes.
- MongoDB running.

Scope:
- Decide PUT (full replace) vs PATCH (partial). This also fixes the image-clearing bug.
- `DELETE /api/pets/:id`, with tests, and support for a 204 response in `apiClient`.
- Delete action in the UI, with confirmation.
- `/` route (redirect to `/pets`) and a 404 page.
- `<Link>` in `app-shell.tsx`.

Done when:
- API tests cover the update semantics and deletion (including 404 and invalid id).
- `pnpm nx run-many -t lint typecheck test build` passes.
- This file is updated.
