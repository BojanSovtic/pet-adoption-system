# Manual QA checklist

My QA process for this project: risk-based, so a change gets the checks its risk calls for, not all 50 cases.

| File                                                 | What it is                                                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| This guide                                           | When to run what, how to choose cases, and the order to run them in                                                                 |
| [manual-qa-test-cases.csv](manual-qa-test-cases.csv) | The catalog and the only place with each case's preconditions, steps and expected result. Filterable in Excel. Never holds results. |
| [manual-qa-log.csv](manual-qa-log.csv)               | The execution log: one row per case per run. Only ever appended to.                                                                 |

Commands run in PowerShell in the repository root. UI text is quoted in English.

## 1. Environments

| Environment       | Web                       | API health                       | Data                                                                                        | Use for                                   |
| ----------------- | ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Docker QA**     | **http://127.0.0.1:4203** | http://127.0.0.1:3336/api/health | Its own MongoDB server (database `pet-adoption-qa`) and photo volume; kept between restarts | All manual QA, including the Docker suite |
| Local development | http://localhost:4200     | http://localhost:3333/api/health | **Your development database** (`pet-adoption`), photos in `apps/api/uploads`                | Development, not for QA                   |

> **Never delete Docker volumes as part of QA.**
>
> - `docker compose down -v` on the main project deletes `pet-adoption-system_mongodb_data`: the development database.
> - `docker volume prune` and Docker Desktop's _Clean / Purge data_ can delete any of them.
>
> To empty the QA data, use `pnpm qa:reset --yes`.

### 1.1 Docker QA

The built web app (nginx) and API in Docker, fully separate from development. The full reference is in the README, "Docker QA environment".

**Needs:** Docker Desktop running, Node.js 22, pnpm 12, `pnpm install`, and `QA_SESSION_SECRET` (32+ random characters) in the root `.env`.

```powershell
pnpm qa:up              # build and start (first build: a few minutes)
pnpm qa:ps              # wait until mongodb, api and web are "healthy"
pnpm qa:seed            # demo data; safe to run again
pnpm qa:reset           # dry run: what a reset would delete
pnpm qa:reset --yes     # delete all QA data (volumes stay), then run pnpm qa:seed
pnpm qa:logs api        # follow the API log
pnpm qa:down            # stop; the data stays
```

Open **http://127.0.0.1:4203**, not `localhost:4203`: the API only accepts `127.0.0.1`, and this keeps the QA sign-in separate from the other environments.

| Role in the cases | Seeded account (password `demo-password`)                |
| ----------------- | -------------------------------------------------------- |
| Owner             | `ana@demo.example.com`: 9 pets, 11 received applications |
| Adopter           | `jelena@demo.example.com`                                |
| Adopter 2         | `luka@demo.example.com`                                  |
| Another user      | `marko@demo.example.com`: owns 5 pets                    |
| Visitor           | signed out                                               |

- **"Seed data:" hints** in the cases refer to these seeded records.
- **Several users at once:** a browser window holds one session, and its tabs share it. Use a normal window, a private window and a second browser to be three users at once.
- **Data that gets used up:** APP-004, OWN-002, OWN-003, OWN-006 and UPL-002 change seeded data for good (decisions are final). Smoke cases create their own pet each time, so they repeat without a reset.
- **Reset:** before a release pass, or when `pnpm qa:seed` reports differences, run `pnpm qa:reset --yes` and then `pnpm qa:seed`. It refuses unless the containers, volumes and database are the QA ones.
- **Sign-in limit:** sign-in and registration allow 20 attempts per 15 minutes. If "Too many attempts" appears, run `pnpm qa:down` and `pnpm qa:up`: the counters reset and the data stays. Run AUTH-010 last.

### 1.2 Other setups (not for manual QA)

- **Local development** (ports 4200/3333) uses your development database.
- **E2E:** `pnpm nx e2e @pet-adoption/web-e2e` starts its own throwaway servers (web :4201, API :3334, in-memory database) for the Playwright tests.

## 2. What to run when

| Level                  | When                                                                                                                              | What                                                                                                                                                                                                                                                                                                                                      | Time                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1. Automated checks    | Every code change                                                                                                                 | Per the testing policy in `CLAUDE.md`: the affected projects' lint, typecheck and tests before committing. CI runs lint, typecheck, test and build for everything on push. Run E2E (`pnpm nx e2e @pet-adoption/web-e2e`) when auth/session, the application workflow, routing, frontend–API integration or shared infrastructure changed. | Minutes, mostly unattended |
| 2. Smoke               | After a change to anything a user sees or does                                                                                    | The 9 smoke cases below, on Docker QA                                                                                                                                                                                                                                                                                                     | 5–10 min                   |
| 3. Targeted regression | When a change touches a feature area                                                                                              | The cases tagged with that area that automation doesn't fully cover (section 3)                                                                                                                                                                                                                                                           | 5–15 min                   |
| 4. Pre-release         | Before calling a version ready, merging to `master`, or a demo                                                                    | Reset QA (`pnpm qa:reset --yes`, `pnpm qa:up`, `pnpm qa:seed`); run all automated checks and E2E; then smoke + the 19 release cases + the Docker suite                                                                                                                                                                                    | About 1 hour               |
| 5. Docker smoke        | After changing Dockerfiles, `docker-compose.yml`, `docker-compose.qa.yml`, `nginx.conf` or env handling, and in every pre-release | The Docker suite below, on Docker QA (it runs the built images)                                                                                                                                                                                                                                                                           | About 10 min               |

Docs-only and CI-only changes need no manual QA. The other 24 cases are targeted only: they run when their area changes.

### Smoke suite

Run in this order, signed in as one user per window. PETS-004 and UPL-001 are one action (create a pet with a photo), and APP-001 applies for that new pet.

1. [ ] **ENV-001** The Docker QA environment starts with its own data
2. [ ] **PETS-001** A visitor browses the pet list and opens a pet
3. [ ] **AUTH-004** Sign in with valid credentials
4. [ ] **AUTH-006** The session survives a refresh and a new tab
5. [ ] **PETS-004** Create a pet
6. [ ] **UPL-001** Add several photos when creating a pet
7. [ ] **APP-001** Apply to adopt another user's pet
8. [ ] **OWN-001** The owner sees received applications with contact details
9. [ ] **AUTH-007** Sign out

### Release suite (in addition to smoke)

- [ ] **PETS-002** Search, filter and sort the pet list
- [ ] **PETS-003** Pet list pagination keeps its state in the URL
- [ ] **AUTH-002** Registration form validation
- [ ] **AUTH-003** Register with an email that already exists
- [ ] **PETS-005** Pet form validation
- [ ] **PETS-006** Edit a pet
- [ ] **PETS-009** A pet with an active application cannot be deleted
- [ ] **UPL-002** Add and remove individual photos when editing
- [ ] **UPL-006** The pet page shows a photo gallery
- [ ] **UPL-007** Uploaded photos lose their location data and stay upright
- [ ] **APP-004** Withdraw a pending application and apply again
- [ ] **OWN-002** Accepting adopts the pet and rejects the other applications
- [ ] **OWN-003** Rejecting the last pending application makes the pet available
- [ ] **OWN-004** Application lists are paginated independently
- [ ] **I18N-001** Switch the language; it is remembered
- [ ] **ERR-001** The API is unreachable
- [ ] **ADMIN-001** Make the first admin from the command line
- [ ] **ADMIN-003** Suspend and reinstate a user
- [ ] **ADMIN-004** Hide and restore a listing

### Docker suite

- [ ] **DOCKER-001** All QA containers are healthy and the app is reachable
- [ ] **DOCKER-002** Sign-in works between the built web app and the API
- [ ] **DOCKER-003** Deep links load directly (nginx)
- [ ] **DOCKER-004** Photos are stored in the volume and survive a restart

## 3. Choosing targeted regression cases

1. **See what changed** since the last QA run: `git diff --name-only <commit>`, using the commit recorded in the log.
2. **Translate the paths into tags** with the table below.
3. **Filter the catalog** on `Run When Changed` (in Excel: _Text Filters → Contains_).
4. **Run only** the cases marked "Partially covered" or "Manual only". Cases covered by Playwright or other automated tests are checked by those suites; if they passed, don't repeat them by hand.
5. **Add the smoke suite** if users will notice the change.

| Changed files                                                                                                                                                                                                                                  | Tag                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `apps/api/src/auth/**`, `apps/api/src/users/**`, `apps/api/src/middleware/rate-limit.ts`, `require-trusted-origin.ts`, `apps/web/src/features/auth/**`                                                                                         | `auth`                                              |
| Pet create/edit/delete and details: `apps/api/src/pets/pet.controller.ts`, `pet.service.ts`, `pet.schema.ts`, `pet.model.ts`; `apps/web/src/features/pets/pages/pet-form-page.tsx`, `pet-details-page.tsx`, `components/delete-pet-button.tsx` | `pets`                                              |
| Pet list, search, filters and paging: the list parts of `pet.service.ts` / `pet.schema.ts`; `pets-page.tsx`, `pet-card.tsx`, `utils/pet-list-params.ts`, `apps/web/src/components/pagination.tsx`                                              | `pet-list`                                          |
| `apps/api/src/pets/pet-image.ts`, `apps/api/src/storage/**`, `components/pet-image-field.tsx`, `api/pet-image.ts`                                                                                                                              | `uploads`                                           |
| `apps/api/src/applications/**`, `packages/shared/models/src/lib/adoption-application.model.ts`, `apps/web/src/features/applications/**`                                                                                                        | `applications`                                      |
| `apps/web/src/i18n/**`, `apps/web/src/app/language-select.tsx`                                                                                                                                                                                 | `i18n`                                              |
| `apps/web/src/lib/api-client.ts`, `get-error-message.ts`, `apps/web/src/app/query-client.ts`, `apps/api/src/middleware/error-handler.ts`, `validate.ts`                                                                                        | `http`                                              |
| `apps/web/src/app/router.tsx`, `app-shell.tsx`                                                                                                                                                                                                 | `routing`                                           |
| `apps/api/src/admin/**`, `apps/api/src/auth/require-auth.ts`, `apps/api/src/scripts/admin-role.ts`, `apps/web/src/features/admin/**`                                                                                                           | `admin`                                             |
| `apps/*/Dockerfile`, `docker-compose.yml`, `docker-compose.qa.yml`, `apps/web/nginx.conf`, `.env.example`, `apps/api/src/config/**`, `apps/api/src/scripts/qa-*.ts`, `reset-qa.ts`                                                             | `docker` (Docker suite)                             |
| `apps/api/src/scripts/**`                                                                                                                                                                                                                      | `demo-scripts`                                      |
| Other files in `packages/shared/models`                                                                                                                                                                                                        | The tags of the features that use the changed types |
| Styling only (Tailwind classes, `components/ui/**`, `index.css`)                                                                                                                                                                               | None: automated checks + smoke                      |

**Examples:**

- **Styling change on the pet card:** automated checks and the smoke suite (look at the cards). No targeted cases.
- **Change to accept/reject logic** (`application.service.ts`): API tests, E2E, smoke, and PETS-009, APP-004, APP-005, OWN-002, OWN-003, OWN-004, OWN-006.
- **Change to sessions or sign-in:** API and web tests, E2E, smoke, and AUTH-002, AUTH-003, AUTH-006, AUTH-007, AUTH-009, AUTH-011.
- **Change to photo upload:** tests, smoke, UPL-001, UPL-002, UPL-004, UPL-006, UPL-007, plus DOCKER-004 if storage paths or env changed.
- **Change to the admin area or roles:** API and web tests, E2E, smoke, and ADMIN-001, ADMIN-003, ADMIN-004, ADMIN-005.

## 4. Recording results

Append one row per case I actually ran to [manual-qa-log.csv](manual-qa-log.csv). Cases I didn't run get no row, so there's no "Not Run" or "N/A".

| Column      | What to write                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run ID      | Date plus a label, e.g. `2026-10-22-smoke`, `2026-10-22-retest`, `2026-11-02-release`. It gives the date and groups the rows of one run; it also sorts by date. |
| Test ID     | From the catalog.                                                                                                                                               |
| Status      | `Pass`, `Fail` or `Blocked` (couldn't run, e.g. a broken environment or a failing precondition).                                                                |
| Environment | `Docker QA` (the only manual QA environment).                                                                                                                   |
| Commit      | `git rev-parse --short HEAD`, so a regression can be narrowed down to the commits between two runs.                                                             |
| Notes       | Only for Fail/Blocked: what happened instead.                                                                                                                   |
| Issue       | For a Fail: a GitHub issue number, or `progress.md` if it is noted there under outstanding issues.                                                              |

- **A failure:** log it as Fail. Fix it at once, or record it (GitHub issue or `docs/progress.md`) and put the reference in Issue.
- **Retest:** after the fix, start a new run (`…-retest`) with just the failed cases plus the smoke suite. The newest row for a Test ID is its current status; older rows stay as history.
- **Editing the log:** VS Code works well (add a line per case). In Excel, open it via _Data → From Text/CSV_ (UTF-8, comma), add rows, and save as "CSV UTF-8 (Comma delimited)". Commit the log together with the code it tested, at least for release runs.
- **Changing the catalog:** add new cases with a new ID; never reuse or renumber IDs, so old log rows stay meaningful.

## 5. Test cases

The preconditions, steps and expected result of every case are in [manual-qa-test-cases.csv](manual-qa-test-cases.csv), the only copy. This is the order I run them in, grouped by who is acting.

### 5.1 Start

- **ENV-001** The Docker QA environment starts with its own data

### 5.2 Visitor: browsing

- **PETS-001** A visitor browses the pet list and opens a pet
- **PETS-002** Search, filter and sort the pet list
- **PETS-003** Pet list pagination keeps its state in the URL
- **UPL-006** The pet page shows a photo gallery

### 5.3 Accounts and sessions

- **AUTH-001** Register a new account
- **AUTH-002** Registration form validation
- **AUTH-004** Sign in with valid credentials
- **AUTH-005** Sign in with a wrong password
- **AUTH-006** The session survives a refresh and a new tab
- **AUTH-007** Sign out
- **AUTH-008** Protected pages redirect to sign-in and return afterwards
- **AUTH-003** Register with an email that already exists
- **AUTH-009** Signing out in one tab affects the other tab
- **AUTH-010** Repeated failed sign-ins are rate-limited
- **AUTH-011** Signed-in users are sent away from sign-in and register pages

### 5.4 Owner: listings and photos

- **PETS-004** Create a pet
- **PETS-005** Pet form validation
- **PETS-006** Edit a pet
- **PETS-007** Delete a pet after confirming
- **PETS-008** Other users cannot edit or delete a pet
- **UPL-001** Add several photos when creating a pet
- **UPL-002** Add and remove individual photos when editing
- **PETS-009** A pet with an active application cannot be deleted
- **PETS-010** Edit page for a missing pet or failed load
- **UPL-003** Wrong file types and too large files are refused before upload
- **UPL-004** A non-image renamed to .png is rejected by the server
- **UPL-005** At most 5 photos per pet, counting the existing ones
- **UPL-007** Uploaded photos lose their location data and stay upright
- **OWN-006** A stale decision in a second tab is refused
- **OWN-007** Empty application lists and a page past the end

### 5.5 Adopter: applying

- **APP-001** Apply to adopt another user's pet
- **APP-003** Owners cannot apply for their own pet
- **APP-004** Withdraw a pending application and apply again
- **APP-006** Adopted pets cannot be applied for
- **APP-002** Application message validation
- **APP-005** A duplicate application is refused

### 5.6 Owner: reviewing applications

- **OWN-001** The owner sees received applications with contact details
- **OWN-002** Accepting adopts the pet and rejects the other applications
- **OWN-003** Rejecting the last pending application makes the pet available
- **OWN-004** Application lists are paginated independently
- **OWN-005** Applications are private

### 5.7 Language, errors and empty states

- **I18N-001** Switch the language; it is remembered
- **I18N-002** Validation messages already on screen switch language
- **ERR-001** The API is unreachable
- **ERR-002** Unknown pages and pet list pages past the end
- **ERR-003** No search results

### 5.8 Admin

- **ADMIN-001** Make the first admin from the command line
- **ADMIN-002** Ordinary users and visitors cannot use the admin area
- **ADMIN-003** Suspend and reinstate a user
- **ADMIN-004** Hide and restore a listing
- **ADMIN-005** The audit log records admin actions

### 5.9 Docker

- **DOCKER-001** All QA containers are healthy and the app is reachable
- **DOCKER-002** Sign-in works between the built web app and the API
- **DOCKER-003** Deep links load directly (nginx)
- **DOCKER-004** Photos are stored in the volume and survive a restart

## 6. What the automated tests cover

Checked against the specs on 2026-10-22; admin and photo re-encoding cases added 2026-10-28. "Covered" means the rule and the UI behaviour are tested; it doesn't mean everything about the case is.

| Coverage                         | Cases                                                                                                                                                                                                                                                                                    | What I do                                                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Covered by Playwright            | AUTH-001, AUTH-004, AUTH-005, APP-001, OWN-001, ADMIN-002                                                                                                                                                                                                                                | Rely on E2E. They still appear in the smoke suite because that's the journey I demo.                                                                                   |
| Covered by other automated tests | AUTH-008, AUTH-010, PETS-007, PETS-008, PETS-010, UPL-003, UPL-005, APP-002, APP-003, APP-006, OWN-005, OWN-007, I18N-002, ERR-002, ERR-003                                                                                                                                              | Rely on the API/component tests. Check by hand only to eyeball UI I changed.                                                                                           |
| Partially covered                | PETS-001, PETS-002, PETS-003, AUTH-002, AUTH-003, AUTH-006, AUTH-007, AUTH-009, PETS-004, PETS-005, PETS-006, PETS-009, UPL-001, UPL-002, UPL-004, UPL-006, APP-004, APP-005, OWN-002, OWN-003, OWN-004, OWN-006, I18N-001, ERR-001, UPL-007, ADMIN-001, ADMIN-003, ADMIN-004, ADMIN-005 | The rules are tested, but not the whole flow in a real browser (e.g. real photo upload, sessions across tabs, URL/Back behaviour). Test by hand when the area changes. |
| Manual only                      | ENV-001, AUTH-011, DOCKER-001, DOCKER-002, DOCKER-003, DOCKER-004                                                                                                                                                                                                                        | No automated test (environment checks, the Docker deployment, redirects away from sign-in pages).                                                                      |

**Where the tests live:**

- **Playwright** (`apps/web-e2e/src/`):
  - register, sign in, wrong credentials
  - pet list with search and species filter
  - apply
  - owner sees and accepts an application, and the pet becomes adopted
  - admin: the real `admin:grant`, overview, role change, suspension, hiding a listing, the audit log; ordinary users are kept out
- **API** (`apps/api/src/**/*.spec.ts`):
  - sessions, rate limits, origin check
  - pet rules and ownership, list paging and search
  - photos: type, size, the 5-photo limit (also with simultaneous uploads), adding, removing, replacing and clean-up; re-encoding (metadata removed, EXIF rotation, pixel limits)
  - admin: roles, suspension, moderation, audit chain, per-admin limits; per-user and per-IP write limits
  - every application rule and transition, including transactions and simultaneous decisions
- **Web components** (`apps/web/src/**/*.spec.tsx`):
  - login form and redirects
  - pet detail and owner controls, delete confirmation
  - the photo field (several files, per-file checks, the 5-photo limit, removing), the partial-failure message and the photo gallery
  - the application section and page, including pagination, empty and error states
  - error mapping, the language selector

**Corrected 2026-10-22:**

- UPL-003 is covered by `pet-form-image.spec.tsx`; it was listed as manual only.
- PETS-001 is only partially covered: Playwright checks the list, not the detail page.
- PETS-007 is covered by `delete-pet-button.spec.tsx` and the API delete tests.

## 7. Not covered here

- **Server errors (HTTP 500)** can't be triggered by hand without code changes. Unit tests cover how they're shown and retried.
- **Two decisions at the same instant** can't be reproduced by hand; the API concurrency tests cover it. OWN-006 checks the stale-tab case.
- **UPL-004** assumes the browser reports a renamed file's type from its extension. That's typical, but unverified.
- **Session expiry** after 7 days, and legacy pets without an owner, can't practically be produced through the app.
- **Mobile layout and accessibility:** no requirements are documented; look at them in the smoke suite if relevant.
- **Write rate limits** (P0-8: e.g. 10 new pets per 10 minutes) are covered by API tests only; reaching them by hand takes many repeated actions.
