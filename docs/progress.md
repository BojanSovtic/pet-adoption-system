# Progress

_Last updated: 2026-10-20. Roadmap step 6 (adoption applications) completed, uncommitted on branch `develop` (latest commit `7e62b63`, pet ownership)._

## Status

### Completed and verified

Verified by passing tests or by reading the code.

- **Pets API:** `GET`, `POST`, `PUT` (full replacement) and `DELETE` on `/api/pets[/:id]`, with consistent `{ code, details? }` errors.
  - **Public:** listing and details. They include `owner` as a user id only.
  - **Signed-in only:** create, update and delete (`requireAuth` → 401).
  - **Owner from the session:** `owner` is required and set from the session, never from the body.
  - **Owner-only changes:** owner-scoped queries; a non-owner gets 403 `NOT_PET_OWNER`.
  - **Deleting:** runs in a transaction. It's blocked by pending or accepted applications (409 `PET_HAS_ACTIVE_APPLICATIONS`); otherwise the pet's rejected and withdrawn applications are deleted with it.
- **Adoption applications** (see `docs/architecture.md` §5 for the diagrams):
  - **Data:** `AdoptionApplication { pet, applicant, message (1–2000), status, timestamps }`. The applicant comes from the session; the status only changes through state-machine actions.
  - **Endpoints:**
    - `POST /api/pets/:petId/applications` → 201.
    - `GET /api/applications/mine`: applicant view, with pet summary and no owner details.
    - `GET /api/applications/received`: owner view, including the applicant's name and email.
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
  - **Pet detail page:** a sign-in prompt for visitors, a "Review applications" link for the owner, an apply form for eligible users, or "Your application: status" with Withdraw.
  - **New `/applications` page:** "Applications for my pets" (applicant name and email, Accept/Reject while pending) and "My applications" (Withdraw while pending). Buttons come from the shared state machine (`getAllowedApplicationActions`).
  - **Identity changes:** every one (sign-in, sign-out, expired session) goes through `setCurrentUser`, which removes cached application data first.
  - **Tests:** 12 new web tests (58 in total).
- **Test infrastructure:**
  - **Database:** the API tests run against an in-memory **replica set** (`mongodb-memory-server`, started once in `test/global-setup.ts`), so transactions are real. `MONGODB_TEST_URI` is no longer used.
  - **Ordering:** spec files run sequentially. The database is dropped and re-indexed once per file, and documents are cleared between tests.

### Incomplete or not verified

- **No browser verification of the application UI.**
- **The Docker replica set setup was not run.** Docker's engine wasn't running on this machine; `docker compose config` validates the file, but the container, replica set initialization and the API connection are untested.
- No component tests for the register page or the user menu.
- Production settings (`Secure` cookies, `trust proxy`, a production replica set) are untested.

## Local MongoDB (action needed)

The API now **refuses to start without a replica set**. It fails with a clear error pointing here, because standalone MongoDB doesn't support transactions. Your current local MongoDB on port 27017 is a standalone install, so pick one option. Nothing on your machine was changed.

**Option A, Docker (recommended).** This is a project-level setup that leaves your local install alone:

1. Start Docker Desktop, then run `docker compose up -d` in the repo root. The health check initializes the single-node replica set `rs0` on the first start. The container listens on **host port 27018**, so it doesn't clash with your local MongoDB on 27017. Any existing data in the `mongodb_data` volume is kept.
2. In `apps/api/.env`, set:
   `MONGODB_URI=mongodb://localhost:27018/pet-adoption?directConnection=true`
3. The new database starts empty. Your old data stays in the local install on 27017. Copy it with `mongodump` / `mongorestore` if you want it.

**Option B, convert your local install** (a machine-wide change, your choice):

1. In `mongod.cfg`, add `replication:` with `  replSetName: rs0`.
2. Restart the MongoDB service.
3. Run `mongosh --eval "rs.initiate()"` once.
4. Use `MONGODB_URI=mongodb://localhost:27017/pet-adoption?directConnection=true`.

Existing data is kept.

`MONGODB_TEST_URI` in your `.env` can be removed; it's ignored.

**Ownerless pets.** The 2 pets created before ownership still have no `owner`. They're visible, but nobody can edit, delete or apply for them. Delete them (`db.pets.deleteMany({ owner: { $exists: false } })`), or assign them to your account after registering:
`db.pets.updateMany({ owner: { $exists: false } }, { $set: { owner: db.users.findOne({ email: 'you@example.com' })._id } })`

## Changes in this session (step 6)

- **Dependencies:**
  - `mongodb-memory-server` 11.3 (dev only), for real transactions in tests on any machine.
  - Its install script is disabled (`allowBuilds: false`), so it downloads the MongoDB 8.2.6 binary on the first test run and caches it in `node_modules/.cache`. **That download is about 780 MB on Windows.**
  - It isn't part of the API bundle.
- **Shared library:** `adoption-application.model.ts`, holding the statuses, both state machines (`APPLICATION_TRANSITIONS`, `PET_STATUS_TRANSITIONS`) and their helpers, and the view types.
- **API:**
  - New `applications/` (model with unique partial indexes, schema, service, controller, routes, specs).
  - In `config/database.ts`: `withTransaction`, plus a replica-set check at startup.
  - In `pet.service`: `lockPet`, `transitionPetStatus`, and a transactional `deleteOwnedPet`.
  - `MONGODB_TEST_URI` removed from `env.ts`.
- **Setup:**
  - `docker-compose.yml` runs a single-node replica set on host port 27018.
  - `.env.example` updated to match.
  - `test/global-setup.ts` added.
- **Web:**
  - New `features/applications/`: API functions, `useApplicationAction`, the status badge, `ApplicationActions`, `PetApplicationSection`, and `ApplicationsPage`.
  - Route `/applications`, plus an "Applications" link in the header.
  - `setCurrentUser` helper.
  - New `applications` i18n namespace and new error codes (`en`, `sr`). The Serbian text uses "zahtev" to avoid a clash with "prijava" (login).
- **Decisions:**
  - **Explicit actions,** not `PATCH status`: each action has one actor and one source state.
  - **No state-machine library:** two small transition tables are clearer.
  - **The pet lock pattern:** a first write that turns races into retried write conflicts.
  - **404 for strangers:** applications are private, so outsiders get 404 rather than 403.

## Check results (2026-10-20, after step 6)

What actually ran, each with `NX_DAEMON=false … --skipNxCache`:

| Project | lint | typecheck | test | build |
|---|---|---|---|---|
| api | ✅ | ✅ | ✅ 100/100 (47 existing + 53 new) | ✅ |
| web | ✅ | ✅ | ✅ 58/58 (46 existing + 12 new) | ✅ |
| models | ✅ | ✅ | none | n/a |

Also checked:
- `nx sync:check` is clean, and `prettier --check` passes on all changed files.
- The startup check rejects the current standalone MongoDB with a clear message (checked against your local MongoDB, read-only).

Not run:
- The Docker setup.
- A browser check.

The web build still warns that the main chunk exceeds 500 kB.

## Security considerations still open

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

- **Pages:**
  - The form page shows "Pet not found" for any load error.
  - The header title isn't translated.
- **Imports and dependencies:**
  - Imports mix `@/…` and relative paths.
  - `sass` appears unused.
  - Peer-dependency warnings from `pnpm install` were not investigated.
- `env.ts` resolves `.env` relative to the working directory.
- React Router v6 future-flag warning.
- **Applications whose applicant account is deleted** aren't handled; there's no account deletion yet.
- **The received-applications query loads all of the owner's pet ids;** this will need pagination once the data grows (step 7).

## Roadmap (agreed priority)

1. ~~Fix basic checks and fresh-clone installation.~~ Done.
2. ~~Shared pet types; standardized API error responses.~~ Done.
3. ~~Complete pet management.~~ Done.
4. ~~Users and authentication.~~ Done.
5. ~~Pet ownership and authorization.~~ Done.
6. ~~Adoption applications and their lifecycle.~~ Done (state machines, transactions).
7. Server-side filtering, searching and pagination when appropriate.
8. Later: image uploads, OAuth/OIDC sign-in (Google/GitHub), Playwright e2e tests, Docker and deployment.

## Next task

**First,** the owner sets up the replica set (see "Local MongoDB" above), runs the app, checks the application flow in the browser, and commits step 6.

**Then roadmap step 7:** server-side filtering, searching and pagination for `GET /api/pets` and the application lists, replacing the client-side `filterPets`.

Decisions needed first:
- Page size, and cursor-based or offset pagination.
- Which filters to support (species, status, name search).
- Whether to use a text index or a case-insensitive prefix match.

Done when:
- API tests cover the filters, the paging limits and input validation.
- The web pets list uses the server parameters.
- The targeted checks pass, and this file is updated.
