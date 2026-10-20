# Progress

_Last updated: 2026-10-20. Roadmap step 5 (pet ownership and authorization) completed, uncommitted on branch `develop` (everything before it is committed, latest `81b8759`)._

## Status

### Completed and verified

Verified by passing tests or by reading the code.

- **Pets API:** `GET`, `POST`, `PUT` (full replacement) and `DELETE` on `/api/pets[/:id]`, with consistent `{ code, details? }` errors. Covered by 28 supertest tests.
  - **Public:** listing and details. They include `owner` (a user id string, no other owner details).
  - **Signed-in only:** create, update and delete. `requireAuth` → 401 `UNAUTHENTICATED`; it also rejects sessions whose user was deleted.
  - **Owner from the session:** `owner` is required and set from the session, never from the body. Tests confirm a supplied `owner` is ignored on create and can't transfer ownership on update.
  - **Owner-only changes:** update and delete use owner-scoped queries (`{ _id, owner }`). Non-owners get 403 `NOT_PET_OWNER` and missing pets 404 `PET_NOT_FOUND`; tests confirm the pet is unchanged.
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
  - **Ownership UI:** Edit and Delete appear only when `isPetOwner(pet, currentUser)` is true.
    - **Signed out:** the pet form redirects to `/login` with `state.from`, and login returns there. Only same-app paths are accepted, not `//…`.
    - **Someone else's pet:** the edit page shows "You can only edit pets you posted."
    - **Errors from the API:** a 403 is translated (`NOT_PET_OWNER`); a 401 clears the current user, which triggers the redirect.
  - **Tests:** 46 web tests, including the login page (with the return path), `getCurrentUser`, the 401 handling, and owner versus non-owner versus signed-out views of the details and form pages.
- **Test infrastructure:**
  - API spec files run sequentially (`fileParallelism: false`).
  - The DB is dropped and re-indexed once per file, and documents are cleared between tests, so the unique email index exists during tests.

### Incomplete or not verified

- No browser verification. Worth checking: the cookie across ports 4200→3333, the header after reload, logout, and the session surviving an API restart.
- No register-page or user-menu component tests (login page is covered).
- Production cookie settings (`Secure`, `trust proxy`) are untested; the deployment setup is unknown.

## Changes in this session (step 5)

- **API:**
  - `Pet.owner` (ObjectId, ref `User`, required, indexed).
  - New `auth/require-auth.ts`: `requireAuth` middleware and `getAuthenticatedUserId`. It runs before validation on POST, PUT and DELETE `/api/pets`.
  - `pet.service`: `createPet(input, ownerId)`, `updateOwnedPet` and `deleteOwnedPet` (owner-scoped queries), plus `petExists`.
  - New `userExists` in `user.service`.
  - New test helper `test/auth-test-helpers.ts` (`createSignedInAgent`).
- **Shared library:** `Pet.owner: string`.
- **Web:**
  - New `features/pets/utils/is-pet-owner.ts`.
  - Details page and form page ownership checks.
  - Login return path.
  - New `NOT_PET_OWNER` and `form.notOwner` translations (`en`, `sr`).
- **Decisions:**
  - **403 rather than 404 for non-owners.** Pets are public, so "not found" for a visible pet would only confuse; the extra existence check runs only after the owner-scoped query misses.
  - **Owner exposed as an id only;** no name or email.
  - **No admin role.**

### Existing pets without an owner (action needed)

Pets created before this step have no `owner`. On 2026-10-20 the local dev DB (`pet-adoption`) had **2 such pets and 0 users**. They were not modified. They stay visible, but no one can edit or delete them, because the owner-scoped queries never match them. There is no migration script. Choose one, in `mongosh` against the dev DB:

```js
// Option A: delete them
db.pets.deleteMany({ owner: { $exists: false } })

// Option B: after registering, assign them to your own account
db.pets.updateMany(
  { owner: { $exists: false } },
  { $set: { owner: db.users.findOne({ email: 'you@example.com' })._id } },
)
```

The test DB is recreated on every run, so it needs nothing.

## Check results (2026-10-20, after step 5)

Command: `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build --skipNxCache`.

| Project | lint | typecheck | test | build |
|---|---|---|---|---|
| api | ✅ | ✅ | ✅ 47/47 | ✅ |
| web | ✅ | ✅ | ✅ 46/46 | ✅ |
| models | ✅ | ✅ | none | n/a |

Also checked:
- `nx sync:check` is clean, and `prettier --check` passes on the changed files.
- Native modules stay external in the API bundle.

The web build warns that the main chunk exceeds 500 kB. Not addressed.

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
5. ~~Pet ownership and authorization.~~ Done.
6. Adoption applications and their lifecycle (available → pending → adopted).
7. Server-side filtering, searching and pagination when appropriate.
8. Later: image uploads, OAuth/OIDC sign-in (Google/GitHub), Playwright e2e tests, Docker and deployment.

## Next task: adoption applications (roadmap step 6)

Prerequisites:
- The owner reviews and commits step 5.
- The owner decides what to do with the ownerless dev pets (see above).

**Product decisions needed before starting:**
- **Application fields:** e.g. a message, contact details, household information.
- **Who may apply:** can owners apply to their own pets? (Probably not.) Can someone apply more than once to the same pet?
- **Lifecycle:** which application statuses exist, e.g. submitted / accepted / rejected / withdrawn.
- **Effect on the pet:** how decisions change `Pet.status`. For example, accepting one application sets the pet to `adopted` and rejects the others. Should `pending` be set automatically?
- **Visibility:** who can see an application (the applicant and the pet owner only).

Scope (once decided):
- An `AdoptionApplication` model (refs to pet and applicant).
- Endpoints scoped by applicant and owner, with tests.
- An apply form, "my applications" for applicants, and an owner review view.
- **Logout must clear the cached per-user data** at this point.

Done when:
- API tests cover permissions (applicant, owner, other user, signed out) and the status transitions.
- `pnpm nx run-many -t lint typecheck test build` passes.
- This file and `docs/architecture.md` are updated.
