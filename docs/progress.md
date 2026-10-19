# Progress

_Last updated: 2026-10-19. Roadmap step 4 (users and authentication) and login rate limiting completed, uncommitted on branch `develop` (step 3 committed in `1791155`)._

## Status

### Completed and verified

Verified by passing tests or by reading the code.

- **Pets API:** `GET`, `POST`, `PUT` (full replacement) and `DELETE` on `/api/pets[/:id]`, with consistent `{ code, details? }` errors.
- **Auth API** (`/api/auth`), covered by 16 supertest tests:
  - `POST /register` → 201 public user and signs in. Duplicate email → 409 `EMAIL_ALREADY_REGISTERED` (unique index, race-safe). Invalid → 400 `VALIDATION_FAILED`.
  - `POST /login` → 200 public user. Wrong password and unknown email both → 401 `INVALID_CREDENTIALS`; unknown emails are verified against a dummy hash so timing doesn't reveal them.
  - `POST /logout` → 204. The session is deleted from the store and the cookie cleared; logging out without a session also succeeds.
  - `GET /me` → 200 public user, or 401 `UNAUTHENTICATED`. A session whose user was deleted is destroyed.
- **Sessions:** `express-session` with a `connect-mongo` store (`sessions` collection, TTL index) reusing Mongoose's MongoClient.
  - **Cookie:** `sid`, `HttpOnly`, `SameSite=Lax`, `Path=/`, 7-day `maxAge`; `Secure` and `trust proxy 1` only when `NODE_ENV=production`.
  - **Anonymous visitors:** `saveUninitialized: false`, so no session is created for them.
  - **Fixation:** the session id is regenerated on login and register; tests confirm the old cookie stops working.
- **Passwords:** Argon2id via `argon2` with its default parameters (64 MiB, t=3, p=4), above the OWASP minimum. They're never stored in plaintext or returned:
  - `select: false` on the hash.
  - An explicit `toPublicUser` allow-list.
  - The shared `User` type has no credential fields.
- **Rate limiting** (`middleware/rate-limit.ts`, `express-rate-limit` 8.6, in-memory stores). Blocked requests get 429 `RATE_LIMITED` with `Retry-After` and `RateLimit` headers. Limiters run before validation. Covered by 3 tests; counters are reset between tests.
  - **Per IP:** 20 attempts per 15 minutes across `/login` and `/register`.
  - **Per IP + email:** 5 *failed* logins per 15 minutes (`skipSuccessfulRequests`). It's not keyed by email alone, so attackers can't lock out a victim.
- **CSRF:** `SameSite=Lax`, plus `requireTrustedOrigin`: POST, PUT, PATCH and DELETE with an `Origin` other than `CORS_ORIGIN` → 403 `UNTRUSTED_ORIGIN`. CORS sends `credentials: true`. Both are tested.
- **Web:**
  - **API client:** `apiClient` sends `credentials: 'include'`.
  - **Current user:** the `['auth', 'me']` query (`useCurrentUser`). Login, register and logout write it; any `UNAUTHENTICATED` error sets it to `null`.
  - **UI:** login and register pages with client-side and server-side field errors, inline error messages, and a redirect when already signed in. The header shows the user's name with a sign-out button, or sign-in and register links.
  - **Tests:** 38 web tests, including the login page, `getCurrentUser` and the 401 handling.
- **Test infrastructure:**
  - API spec files run sequentially (`fileParallelism: false`).
  - The DB is dropped and re-indexed once per file, and documents are cleared between tests, so the unique email index exists during tests.

### Incomplete or not verified

- No browser verification. Worth checking: the cookie across ports 4200→3333, the header after reload, logout, and the session surviving an API restart.
- No register-page or user-menu component tests (login page is covered).
- Production cookie settings (`Secure`, `trust proxy`) are untested; the deployment setup is unknown.

## Changes in this session (step 4)

- **Dependencies:**
  - Added `express-session`, `connect-mongo`, `argon2` and `mongodb` (`~7.5.0`, pinned to Mongoose's driver so only one copy is installed), plus `@types/express-session`.
  - `argon2` ships prebuilt binaries, so `pnpm-workspace.yaml` sets `allowBuilds: argon2: false` and no install scripts run.
- **Environment:**
  - `SESSION_SECRET` (required, at least 32 characters) and `NODE_ENV` added to `env.ts` and `.env.example`.
  - A random secret was appended to the local `apps/api/.env`.
- **API:**
  - New `users/` (model, service).
  - New `auth/`: `password.ts`, `session.ts`, schema, service, controller, routes, spec.
  - New `middleware/require-trusted-origin.ts`.
  - New error classes `UnauthorizedError`, `ForbiddenError` and `ConflictError`.
  - `app.ts` wiring: CORS credentials, origin check, session middleware, `/api/auth`.
- **Shared library:** `user.model.ts` (`User`, `RegisterInput`, `LoginInput`, length limits).
- **Web:**
  - New `features/auth/`: API functions, `useCurrentUser`, `FormField`, schemas, login and register pages, `UserMenu`.
  - Routes `/login` and `/register`.
  - New `auth` i18n namespace and new error codes in `en` and `sr`.
- **Fixed while implementing:**
  - Mongoose 9's `connection.asPromise()` resolves immediately if `connect()` hasn't been called yet, so the session store now waits for the `connected` event.
  - `Model.init()` is memoized, so the test setup uses `createIndexes()` after dropping the DB.

## Check results (2026-10-19, after step 4)

Command: `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build --skipNxCache`.

| Project | lint | typecheck | test | build |
|---|---|---|---|---|
| api | ✅ | ✅ | ✅ 39/39 | ✅ |
| web | ✅ | ✅ | ✅ 38/38 | ✅ |
| models | ✅ | ✅ | none | n/a |

Also checked:
- `nx sync:check` is clean, and `prettier --check` passes on the changed files.
- Native modules stay external in the API bundle.

The web build now warns that the main chunk exceeds 500 kB; it was 488 kB before this step. Not addressed.

## Security considerations still open

- **Rate limiting limits:**
  - The counters are in memory: they reset on restart and aren't shared between API instances. Scaling out needs a shared store.
  - Distributed credential stuffing from many IPs is only slowed, not stopped. Stronger options are CAPTCHA after failures, breached-password checks, and MFA.
  - Users behind one shared IP (an office NAT) share the 20-per-15-minute budget.
  - Correct `trust proxy` is required in production, or every user appears to come from the proxy's IP.
- **Registration reveals whether an email exists** (409). Avoiding that needs email verification flows.
- No email verification, password reset or "log out other sessions". No `argon2.needsRehash` upgrade path yet.
- **Fixed session lifetime:** an absolute 7 days from login, with no idle timeout.
- **Logout and cached user data:** logout clears only the current-user cache. Once user-specific data is cached (step 6), logout must also clear it (e.g. `queryClient.clear()`).
- **Production setup:**
  - HTTPS is needed for `Secure` cookies.
  - `trust proxy` must match the real proxy setup.
  - Serving web and API from the same site keeps `SameSite=Lax` working. A different site would need `SameSite=None; Secure` and token-based CSRF.
- **Origin check details:** requests without an `Origin` header are allowed by design (non-browser clients). `Origin: null` is rejected.

## Other outstanding issues

- **Pages:**
  - The form page shows "Pet not found" for any load error.
  - The header title isn't translated.
- **Imports and dependencies:**
  - Imports mix `@/…` and relative paths.
  - `sass` appears unused.
  - Peer-dependency warnings from `pnpm install` were not investigated.
- `env.ts` requires `MONGODB_TEST_URI` even outside tests and resolves `.env` relative to the working directory.
- React Router v6 future-flag warning in tests and the browser.

## Roadmap (agreed priority)

1. ~~Fix basic checks and fresh-clone installation.~~ Done.
2. ~~Shared pet types; standardized API error responses.~~ Done.
3. ~~Complete pet management.~~ Done.
4. ~~Users and authentication.~~ Done (email/password, server-side sessions).
5. Pet ownership and authorization.
6. Adoption applications and their lifecycle (available → pending → adopted).
7. Server-side filtering, searching and pagination when appropriate.
8. Later: image uploads, OAuth/OIDC sign-in (Google/GitHub), Playwright e2e tests, Docker and deployment.

## Next task: pet ownership and authorization (roadmap step 5)

Prerequisites:
- The owner reviews and commits step 4 and the rate limiting.

Scope:
- `requireAuth` middleware: reads `req.session.userId` and returns 401 `UNAUTHENTICATED`.
- Pets get an `ownerId` set from the session, never from the request body.
- Only the owner can update or delete (403 `FORBIDDEN`). Decide whether to return 404 instead, to hide existence.
- Existing pets without an owner need a migration decision.
- Web: hide or disable edit and delete for non-owners; require sign-in to create.

Done when:
- API tests cover unauthenticated (401), non-owner (403) and owner (200/204) access for create, update and delete.
- `pnpm nx run-many -t lint typecheck test build` passes.
- This file is updated.
