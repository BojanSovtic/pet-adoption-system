# Progress

_Last updated: 2026-10-19. Roadmap step 3 (finish pet management) completed, uncommitted on branch `develop` (previous work committed in `9bd7683`)._

## Status

### Completed and verified

Verified by passing tests or by reading the code.

- **API endpoints:** `GET /api/health`, plus `GET`, `POST`, `PUT` and `DELETE` on `/api/pets[/:id]`. Covered by 20 supertest integration tests against a real test DB.
- **Update semantics (`PUT`):**
  - Full replacement of client-editable fields (`name`, `species`, `age`, `description`, `imageUrls`).
  - The body is validated with the full schema, so a partial body → 400 `VALIDATION_FAILED`.
  - Omitted `imageUrls` defaults to `[]`, which clears images.
  - `status` and timestamps are server-managed; unknown fields are stripped.
- **Deletion:** `DELETE /api/pets/:id` → 204 with no body; invalid id → 400 `INVALID_PET_ID`; missing pet → 404 `PET_NOT_FOUND`.
- **API errors:** always `{ code, details? }`; `INVALID_JSON` for malformed bodies; only unexpected 500s are logged.
- **Shared library** `@pet-adoption/models`: pet types and constants, plus the error contract. `UpdatePetInput` is now the same as `CreatePetInput`.
- **Web:**
  - **Pages:** pet list with client-side search and filters, details page, create/edit form. The form always sends the full pet, so clearing image URLs now works.
  - **Delete:** an inline two-step confirmation on the details page (`DeletePetButton`). On success it removes the pet from the cached list, navigates to `/pets` with `replace`, removes the detail query and shows a toast. Errors use the global mutation toast.
  - **Routing:** `/` redirects to `/pets`; unknown routes render `NotFoundPage` inside the layout. The header uses `<Link>`.
- **Web error handling:** see `CLAUDE.md`. `apiClient` now returns `undefined` for 204 responses.
- **i18n:** all new texts (delete flow, not-found page) are in `en` and `sr`.

### Incomplete or not verified

- No browser verification of the UI changes (delete flow, redirect, 404 page, image clearing). The owner runs the servers.
- No component tests for the list, details or form pages. The delete button and routes have component tests.

## Changes in this session (step 3)

- **API:**
  - `PUT` uses the full schema, and `imageUrls` gets `.default([])`.
  - New `deletePet` service and `deletePetController` (204), plus the `DELETE /:id` route.
  - The id check is extracted into a local `getPetId` helper in `pet.controller.ts`, used by get, update and delete.
- **Web:**
  - `apiClient` handles 204.
  - New `api/delete-pet.ts` and `components/delete-pet-button.tsx`.
  - The form sends `result.data` unchanged.
  - `router.tsx` exports `routes`, adds the index redirect and the `*` route.
  - New `app/not-found-page.tsx`.
  - `app-shell.tsx` uses `<Link>`.
- **Decisions:**
  - **PUT, not PATCH.** The only client (the edit form) always sends the complete pet, and full replacement fixes image clearing without special cases. PATCH can be added later if a real partial-update use case appears, e.g. owner status changes in step 6.
  - **Inline confirmation instead of a modal.** It needs no new dependency, uses one `useState`, and is easy to test.
  - **Validation runs before the id check.** A bad body sent to a bad id returns `VALIDATION_FAILED`, not `INVALID_PET_ID`.

## Check results (2026-10-19, after step 3)

Command: `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build --skipNxCache`. Lint and test were rerun after a final formatting-only Prettier pass.

| Project | lint | typecheck | test | build |
|---|---|---|---|---|
| api | ✅ | ✅ | ✅ 20/20 | ✅ |
| web | ✅ no warnings | ✅ | ✅ 30/30 | ✅ |
| models | ✅ | ✅ | none | n/a |

Also checked: `nx sync:check` is clean, and `prettier --check` passes on the changed files.

Web tests print React Router's v6 "future flag" warning (`v7_startTransition`). It's informational and also appears in the app; not addressed.

## Outstanding issues

- **Pages:**
  - The form page shows "Pet not found" for any load error, including network errors.
  - The header title "Pet Adoption" is not translated.
- **Imports and dependencies:**
  - Imports mix `@/…` and relative paths.
  - `sass` is installed but appears unused.
  - `pnpm install` prints peer-dependency warnings (not investigated).
- `env.ts` requires `MONGODB_TEST_URI` even outside tests and resolves `.env` relative to the working directory.
- Possible test flakiness (not observed):
  - Both API spec files share one test DB and drop it after each test while running in parallel.
  - The "returns all pets" ordering test depends on `createdAt` and may flip when two pets share a millisecond.

## Roadmap (agreed priority)

1. ~~Fix basic checks and fresh-clone installation.~~ Done.
2. ~~Shared pet types; standardized API error responses.~~ Done (plus centralized web error handling).
3. ~~Complete pet management: PUT vs PATCH, deletion, root route and 404 page.~~ Done.
4. Users and authentication.
5. Pet ownership and authorization.
6. Adoption applications and their lifecycle (available → pending → adopted).
7. Server-side filtering, searching and pagination when appropriate. Auth headers and 401 handling go into `apiClient` / `QueryClient` when step 4 needs them.
8. Later: image uploads, Playwright e2e tests, Docker and deployment.

## Next task: users and authentication (roadmap step 4)

Prerequisites:
- The owner reviews and commits step 3.
- MongoDB running.

**Decisions needed from the owner before starting:**
- Session cookies (`express-session` + a Mongo store) vs JWT. Cookies are simpler and safer for a same-site web app; JWT suits third-party or mobile clients.
- Password hashing library (`argon2` or `bcrypt`). Either adds a dependency; explain the choice before adding it.

Scope:
- A `User` model with a unique email and a hashed password; register, login, logout and "current user" endpoints, with validation and tests.
- Rate limiting or other abuse protection on login: decide whether it's in scope.
- Web: login and register pages, current-user query, and 401 handling in `apiClient` / `QueryClient`.
- Protecting create, edit and delete is step 5 (ownership), but the endpoints should be ready for it.

Done when:
- API tests cover registration (including duplicate email), login (wrong password), logout, and current user with and without a session.
- `pnpm nx run-many -t lint typecheck test build` passes.
- This file is updated.
