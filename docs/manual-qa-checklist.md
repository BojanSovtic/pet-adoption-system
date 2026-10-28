# Manual QA checklist

My QA process for this project: risk-based, so a change gets the checks its risk calls for, not all 50 cases.

| File                                                 | What it is                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| This guide                                           | When to run what, how to choose cases, and the details of every case     |
| [manual-qa-test-cases.csv](manual-qa-test-cases.csv) | The catalog: one row per case, filterable in Excel. Never holds results. |
| [manual-qa-log.csv](manual-qa-log.csv)               | The execution log: one row per case per run. Only ever appended to.      |

Commands run in PowerShell in the repository root. UI text is quoted in English.

## 1. Environments

| Environment           | Web                       | API health                       | Data                                                                                         | Use for                                   |
| --------------------- | ------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Docker QA**         | **http://127.0.0.1:4203** | http://127.0.0.1:3336/api/health | Its own MongoDB server (database `pet-adoption-qa`) and photo volume; kept between restarts  | All manual QA, including the Docker suite |
| Local development     | http://localhost:4200     | http://localhost:3333/api/health | **Your development database** (`pet-adoption`), photos in `apps/api/uploads`                 | Development, not for QA                   |

> **Never delete Docker volumes as part of QA.**
>
> - `docker compose down -v` on the main project deletes `pet-adoption-system_mongodb_data`: the development database.
> - `docker volume prune` and Docker Desktop's _Clean / Purge data_ can delete any of them.
>
> To empty the QA data, use `pnpm qa:reset --yes`.

### 1.1 Docker QA

The built web app (nginx) and API in Docker, fully separate from development and the demo. The full reference is in the README, "Docker QA environment".

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
| 4. Pre-release         | Before calling a version ready, merging to `master`, or a demo                                                                    | Reset QA (`pnpm qa:reset --yes`, `pnpm qa:up`, `pnpm qa:seed`); run all automated checks and E2E; then smoke + the 15 release cases + the Docker suite                                                                                                                                                                                    | About 1 hour               |
| 5. Docker smoke        | After changing Dockerfiles, `docker-compose.yml`, `docker-compose.qa.yml`, `nginx.conf` or env handling, and in every pre-release | The Docker suite below, on Docker QA (it runs the built images)                                                                                                                                                                                                                                                                           | About 10 min               |

Docs-only and CI-only changes need no manual QA. The other 22 cases are targeted only: they run when their area changes.

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
- [ ] **APP-004** Withdraw a pending application and apply again
- [ ] **OWN-002** Accepting adopts the pet and rejects the other applications
- [ ] **OWN-003** Rejecting the last pending application makes the pet available
- [ ] **OWN-004** Application lists are paginated independently
- [ ] **I18N-001** Switch the language; it is remembered
- [ ] **ERR-001** The API is unreachable

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
| `apps/*/Dockerfile`, `docker-compose.yml`, `docker-compose.qa.yml`, `apps/web/nginx.conf`, `.env.example`, `apps/api/src/config/**`, `apps/api/src/scripts/qa-*.ts`, `reset-qa.ts`                                                             | `docker` (Docker suite)                             |
| `apps/api/src/scripts/**`                                                                                                                                                                                                                      | `demo-scripts`                                      |
| Other files in `packages/shared/models`                                                                                                                                                                                                        | The tags of the features that use the changed types |
| Styling only (Tailwind classes, `components/ui/**`, `index.css`)                                                                                                                                                                               | None: automated checks + smoke                      |

**Examples:**

- **Styling change on the pet card:** automated checks and the smoke suite (look at the cards). No targeted cases.
- **Change to accept/reject logic** (`application.service.ts`): API tests, E2E, smoke, and PETS-009, APP-004, APP-005, OWN-002, OWN-003, OWN-004, OWN-006.
- **Change to sessions or sign-in:** API and web tests, E2E, smoke, and AUTH-002, AUTH-003, AUTH-006, AUTH-007, AUTH-009, AUTH-011.
- **Change to photo upload:** tests, smoke, UPL-001, UPL-002, UPL-004, UPL-006, plus DOCKER-004 if storage paths or env changed.

## 4. Recording results

Append one row per case I actually ran to [manual-qa-log.csv](manual-qa-log.csv). Cases I didn't run get no row, so there's no "Not Run" or "N/A".

| Column      | What to write                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run ID      | Date plus a label, e.g. `2026-10-22-smoke`, `2026-10-22-retest`, `2026-11-02-release`. It gives the date and groups the rows of one run; it also sorts by date. |
| Test ID     | From the catalog.                                                                                                                                               |
| Status      | `Pass`, `Fail` or `Blocked` (couldn't run, e.g. a broken environment or a failing precondition).                                                                |
| Environment | `Docker QA` (or `Demo` if you ever test there).                                                                                                                 |
| Commit      | `git rev-parse --short HEAD`, so a regression can be narrowed down to the commits between two runs.                                                             |
| Notes       | Only for Fail/Blocked: what happened instead.                                                                                                                   |
| Issue       | For a Fail: a GitHub issue number, or `progress.md` if it is noted there under outstanding issues.                                                              |

- **A failure:** log it as Fail. Fix it at once, or record it (GitHub issue or `docs/progress.md`) and put the reference in Issue.
- **Retest:** after the fix, start a new run (`…-retest`) with just the failed cases plus the smoke suite. The newest row for a Test ID is its current status; older rows stay as history.
- **Editing the log:** VS Code works well (add a line per case). In Excel, open it via _Data → From Text/CSV_ (UTF-8, comma), add rows, and save as "CSV UTF-8 (Comma delimited)". Commit the log together with the code it tested, at least for release runs.
- **Changing the catalog:** add new cases with a new ID; never reuse or renumber IDs, so old log rows stay meaningful.

## 5. Test cases

Each case shows: priority · suite · automation coverage · tags.

### 5.1 Start

#### ENV-001 · The Docker QA environment starts with its own data

Critical · Smoke · Manual only · Run when changed: docker; demo-scripts

- **Before:** Docker Desktop running, QA_SESSION_SECRET in the root .env. `pnpm qa:up` and `pnpm qa:seed` done (section 1).
- **Steps:**
  1. Run `pnpm qa:ps`.
  2. Run `pnpm qa:reset` (a dry run: it only shows what a reset would delete).
  3. Open http://127.0.0.1:3336/api/health, then http://127.0.0.1:4203.
- **Expect:** pet-adoption-qa-mongodb, -api and -web are "healthy". The dry run names database "pet-adoption-qa" and volume "pet-adoption-qa_uploads_data", and deletes nothing. Health returns {"status":"ok"}. The web app shows the 14 seeded pets, most with a photo, and none of your development or demo pets.

### 5.2 Visitor: browsing

#### PETS-001 · A visitor browses the pet list and opens a pet

Critical · Smoke · Partially covered · Run when changed: pet-list; pets

- **Before:** Signed out. At least 2 pets exist. Seed data: any pet.
- **Steps:**
  1. Open /pets.
  2. Click "View details" on a pet.
  3. Click "Back to pets".
- **Expect:** Cards show name, species, age, status and photo or "No image available". The detail page shows the description and status badge. Edit and Delete are not shown. The adoption section says "Interested in adopting <name>? Sign in to apply".

#### PETS-002 · Search, filter and sort the pet list

High · Release · Partially covered · Run when changed: pet-list

- **Before:** Pets with similar names and different species/status exist (e.g. demo data: Max, Maxi, Bella, Bello). Seed data: search "max" (Max, Maxi) and "bel" (Bella, Bello).
- **Steps:**
  1. Type part of a name in "Search pets by name..." and wait a moment.
  2. Choose a species in "Filter by species".
  3. Choose a status in "Filter by status".
  4. Change "Sort by" to each option.
- **Expect:** Results update after you stop typing and match case-insensitively anywhere in the name. "<n> pets found" matches the cards. Filters combine with the search. Sort order follows the chosen option. The URL contains the search, filters and sort.

#### PETS-003 · Pet list pagination keeps its state in the URL

High · Release · Partially covered · Run when changed: pet-list

- **Before:** More than 12 pets exist (demo data has 14). Seed data: 14 pets.
- **Steps:**
  1. On /pets click "Next".
  2. Open a pet on page 2, then use the browser Back button.
  3. Refresh the page.
  4. Change a filter.
- **Expect:** "Page 2 of 2" is shown and the URL has page=2. Back and refresh return to the same page with the same filters. Changing a filter goes back to page 1. "Previous" is disabled on page 1 and "Next" on the last page.

#### UPL-006 · The pet page shows a photo gallery

High · Release · Partially covered · Run when changed: uploads; pets

- **Before:** Signed out is fine. A pet with several photos, one with one photo, one with none. Seed data: Max (5), Toby (1), Kiki (0).
- **Steps:**
  1. Open the pet with several photos; click the second thumbnail.
  2. Press Tab until a thumbnail is focused and press Enter.
  3. Open the pet with one photo, then the one without photos; check them at a narrow window width too.
- **Expect:** The large photo switches to the chosen thumbnail, which is highlighted; thumbnails work with the keyboard and show a focus ring. A single photo shows no thumbnails; a pet without photos shows no photo area. Thumbnails wrap on narrow screens.

### 5.3 Accounts and sessions

#### AUTH-001 · Register a new account

Critical · Targeted · Covered by Playwright · Run when changed: auth

- **Before:** Signed out. An email address not registered yet.
- **Steps:**
  1. Click "Register".
  2. Fill Name, Email and a password of at least 8 characters.
  3. Click "Create account".
- **Expect:** You land on /pets, signed in. The header shows your name, "Applications" and "Sign out". A welcome toast appears.

#### AUTH-002 · Registration form validation

High · Release · Partially covered · Run when changed: auth

- **Before:** Signed out, on /register.
- **Steps:**
  1. Click "Create account" with all fields empty.
  2. Enter an invalid email and a 5-character password, submit again.
- **Expect:** Empty form: "Name is required.", "Email is required." and "Password must be at least 8 characters." Second attempt: "Enter a valid email address." and the password message. No request is sent and no account is created.

#### AUTH-004 · Sign in with valid credentials

Critical · Smoke · Covered by Playwright · Run when changed: auth

- **Before:** An existing account. Signed out.
- **Steps:**
  1. Click "Sign in".
  2. Enter email and password.
  3. Click "Sign in".
- **Expect:** You land on /pets, signed in. Toast "Welcome back, <name>!".

#### AUTH-005 · Sign in with a wrong password

High · Targeted · Covered by Playwright · Run when changed: auth

- **Before:** An existing account. Signed out.
- **Steps:**
  1. Sign in with the right email and a wrong password.
- **Expect:** Inline error "Incorrect email or password." You stay on /login, signed out.

#### AUTH-006 · The session survives a refresh and a new tab

Critical · Smoke · Partially covered · Run when changed: auth; http

- **Before:** Signed in.
- **Steps:**
  1. Refresh the page.
  2. Open /applications in a new tab of the same browser window.
- **Expect:** You are still signed in in both tabs. The Applications page loads without asking you to sign in.

#### AUTH-007 · Sign out

Critical · Smoke · Partially covered · Run when changed: auth

- **Before:** Signed in, on /applications.
- **Steps:**
  1. Click "Sign out".
  2. Open /applications again (or use the browser Back button).
- **Expect:** Toast "You have been signed out." The header shows "Sign in" and "Register". /applications redirects to /login.

#### AUTH-008 · Protected pages redirect to sign-in and return afterwards

High · Targeted · Covered by other automated tests · Run when changed: auth; routing

- **Before:** Signed out.
- **Steps:**
  1. Open /pets/new.
  2. Sign in on the page you are sent to.
- **Expect:** You are redirected to /login. After signing in you are back on /pets/new ("Add a pet"). The same works for /applications.

#### AUTH-003 · Register with an email that already exists

High · Release · Partially covered · Run when changed: auth

- **Before:** An existing account (e.g. Owner). Seed data: register ANA@DEMO.EXAMPLE.COM.
- **Steps:**
  1. Signed out, register again with the same email in different letter case (e.g. OWNER@...).
- **Expect:** Inline error "An account with this email already exists." You stay signed out on /register.

#### AUTH-009 · Signing out in one tab affects the other tab

Medium · Targeted · Partially covered · Run when changed: auth; http

- **Before:** Signed in, two tabs open on a pet you could apply for.
- **Steps:**
  1. Sign out in tab 1.
  2. In tab 2 (still showing the signed-in view) submit an application or save a form.
- **Expect:** Nothing is saved. Tab 2 switches to the signed-out state: the pet page shows "Sign in to apply" (an error "Please sign in to continue." may show briefly); a form page redirects to /login.

#### AUTH-010 · Repeated failed sign-ins are rate-limited

Medium · Targeted · Covered by other automated tests · Run when changed: auth

- **Before:** An existing account. Run this last: it blocks that account from this IP for 15 minutes. Seed data: use an address that has no account, e.g. ratelimit@qa.example.com, so no demo account gets blocked.
- **Steps:**
  1. Sign in with a wrong password 6 times for the same email.
- **Expect:** Attempts 1-5 show "Incorrect email or password."; the 6th shows "Too many attempts. Please wait a few minutes and try again."
- **Cleanup:** Wait 15 minutes, or restart the QA API (this also deletes all QA data).

#### AUTH-011 · Signed-in users are sent away from sign-in and register pages

Medium · Targeted · Manual only · Run when changed: auth; routing

- **Before:** Signed in.
- **Steps:**
  1. Open /login.
  2. Open /register.
- **Expect:** Both pages immediately redirect you (to /pets) instead of showing the forms.

### 5.4 Owner: listings and photos

#### PETS-004 · Create a pet

Critical · Smoke · Partially covered · Run when changed: pets

- **Before:** Signed in as Owner.
- **Steps:**
  1. Click "Add a pet".
  2. Fill Name, Species, Age (whole number) and Description.
  3. Click "Create pet".
- **Expect:** Toast "Pet created successfully." You land on the new pet's page with status "Available" and the Edit and Delete controls. The pet appears at the top of /pets (newest first).

#### PETS-005 · Pet form validation

High · Release · Partially covered · Run when changed: pets

- **Before:** Signed in, on "Add a pet".
- **Steps:**
  1. Click "Create pet" with empty fields.
  2. Enter age "-1" or "2.5" and submit.
- **Expect:** Messages "Name is required.", "Age is required." / "Age must be a non-negative whole number." and "Description is required." appear. Nothing is saved.

#### PETS-006 · Edit a pet

Critical · Release · Partially covered · Run when changed: pets

- **Before:** Signed in as Owner, on one of your pets. Seed data: Ana edits Nala.
- **Steps:**
  1. Click "Edit pet".
  2. Change name, age and description.
  3. Click "Save changes".
- **Expect:** Toast "Pet updated successfully." The detail page and the list show the new values. The status is unchanged.

#### PETS-007 · Delete a pet after confirming

High · Targeted · Covered by other automated tests · Run when changed: pets

- **Before:** Signed in as Owner, a pet with no pending or accepted applications. Seed data: create a pet just for this and delete it (demo pets have applications).
- **Steps:**
  1. On the pet page click "Delete".
  2. Click "Cancel".
  3. Click "Delete" again, then "Yes, delete".
- **Expect:** Cancel keeps the pet. After confirming, toast "<name> was deleted.", you are taken to the list and the pet is gone.

#### PETS-008 · Other users cannot edit or delete a pet

High · Targeted · Covered by other automated tests · Run when changed: pets; auth

- **Before:** Signed in as Adopter. A pet owned by Owner. Seed data: Jelena opens Ana's Max.
- **Steps:**
  1. Open the Owner's pet.
  2. Open /pets/<that pet id>/edit directly.
- **Expect:** No Edit or Delete controls on the pet page. The edit URL shows "You can only edit pets you posted." without a form.

#### UPL-001 · Add several photos when creating a pet

Critical · Smoke · Partially covered · Run when changed: uploads; pets

- **Before:** Signed in as Owner. 2–3 JPEG or PNG files under 5 MB each, without personal metadata. Seed data: Ana creates a new pet.
- **Steps:**
  1. On "Add a pet" fill the fields, click "Add photos" and choose 2–3 files at once.
  2. Click "Create pet".
- **Expect:** Before saving, each file shows as a preview tile ("Photo 1", "Photo 2"…), the first marked "Main photo", and the hint says "Photos: N of 5." After saving, the pet page shows the first photo large with a thumbnail per photo, and the card in the list shows the first photo. Opening a photo in a new tab works (URL under http://127.0.0.1:3336/uploads/pets/).

#### UPL-002 · Add and remove individual photos when editing

High · Release · Partially covered · Run when changed: uploads

- **Before:** Signed in as Owner, a pet with at least 2 photos. Seed data: Ana edits Max (5 photos); this changes Max's seeded photos (pnpm qa:reset --yes, then pnpm qa:seed restores them).
- **Steps:**
  1. Edit the pet and click "Remove photo 1".
  2. Click "Add photos" and choose one new file.
  3. Click "Save changes".
- **Expect:** The removed photo disappears from the form at once and the next photo becomes "Main photo"; with Max, removing one re-enables "Add photos". After saving ("Pet updated successfully."), the pet page shows the remaining photos in order with the new one last, and the removed photo is gone everywhere.

#### PETS-009 · A pet with an active application cannot be deleted

High · Release · Partially covered · Run when changed: pets; applications

- **Before:** Signed in as Owner, a pet with a pending (or accepted) application. Seed data: Ana deletes Max (Jelena's application is pending).
- **Steps:**
  1. On the pet page click "Delete", then "Yes, delete".
- **Expect:** Error toast "This pet has open or accepted adoption applications and cannot be deleted." The pet stays.

#### PETS-010 · Edit page for a missing pet or failed load

Medium · Targeted · Covered by other automated tests · Run when changed: pets; http

- **Before:** Signed in.
- **Steps:**
  1. Open /pets/aaaaaaaaaaaaaaaaaaaaaaaa/edit (valid-looking id that does not exist).
  2. Open your own pet's edit page with the browser offline (DevTools > Network > Offline), then go online and click "Try again".
- **Expect:** Missing pet: "Pet not found" and "Back to pets", no "Try again". Offline: "The server could not be reached. Check your connection and try again." with "Try again", which loads the form once online.

#### UPL-003 · Wrong file types and too large files are refused before upload

High · Targeted · Covered by other automated tests · Run when changed: uploads

- **Before:** Signed in, on the pet form. One valid JPEG, plus a GIF (or PDF) and an image larger than 5 MB.
- **Steps:**
  1. Click "Add photos" and choose all three files at once (switch the file dialog to "All files"; it offers only JPEG, PNG and WebP).
- **Expect:** The valid file is added as a preview. For the others: "<file name>: Choose a JPEG, PNG or WebP image." and "<file name>: The photo must be at most 5 MB." They are not sent.

#### UPL-004 · A non-image renamed to .png is rejected by the server

Medium · Targeted · Partially covered · Run when changed: uploads; http

- **Before:** Signed in, on "Add a pet". A text file renamed to fake.png, plus one real JPEG.
- **Steps:**
  1. Fill the form, add both files with "Add photos", click "Create pet".
- **Expect:** The pet is created, then the toast says "The pet was saved, but the photos were not: Only JPEG, PNG and WebP photos are supported." The pet has no photos: the server stores all files of an upload or none. (Assumes the browser reports the type from the extension, so the client check passes; unverified.)

#### UPL-005 · At most 5 photos per pet, counting the existing ones

High · Targeted · Covered by other automated tests · Run when changed: uploads

- **Before:** Signed in as Owner, a pet with 3 photos. Seed data: Ana edits Rex.
- **Steps:**
  1. Click "Add photos" and choose 3 files at once.
  2. Click "Save changes".
- **Expect:** Two files are added; the third shows "<file name>: Not added: a pet can have at most 5 photos." The hint says "Photos: 5 of 5." and "Add photos" is disabled. After saving, the pet has 5 photos.

#### OWN-006 · A stale decision in a second tab is refused

Medium · Targeted · Partially covered · Run when changed: applications; http

- **Before:** Signed in as Owner. Two pending applications for one pet; /applications open in two tabs. Seed data: needs Rex untouched, so run it instead of OWN-002 or after a QA reset.
- **Steps:**
  1. Tab 1: accept application 1.
  2. Tab 2 (not refreshed): click "Reject" on application 1, then "Accept" on application 2.
- **Expect:** Reject shows the error toast "This application has already been decided or withdrawn." Accept shows "This pet is no longer available for adoption." Nothing changes; refresh tab 2 to see application 1 "Accepted" and application 2 "Rejected".

#### OWN-007 · Empty application lists and a page past the end

Medium · Targeted · Covered by other automated tests · Run when changed: applications

- **Before:** Signed in as a user with no applications. Seed data: register a new account for the empty lists; Ana for page 9.
- **Steps:**
  1. Open /applications.
  2. Open /applications?receivedPage=9 as a user with some received applications.
- **Expect:** "No one has applied for your pets yet." and "You haven't applied to adopt any pets yet." Past the end: "There are no applications on this page." with "Go to the first page".

### 5.5 Adopter: applying

#### APP-001 · Apply to adopt another user's pet

Critical · Smoke · Covered by Playwright · Run when changed: applications

- **Before:** Signed in as Adopter. An available pet owned by Owner. Seed data: Jelena applies for the pet Ana created in PETS-004, so it repeats without a reset (or Bella).
- **Steps:**
  1. Open the pet.
  2. Write a message in "Why would you like to adopt <name>?".
  3. Click "Send application".
- **Expect:** Toast "Your application was sent." The section shows "Your application:" "Pending" and "Withdraw". The pet status becomes "Pending". The application is listed under "My applications".

#### APP-003 · Owners cannot apply for their own pet

High · Targeted · Covered by other automated tests · Run when changed: applications; auth

- **Before:** Signed in as Owner. Seed data: Ana opens Max.
- **Steps:**
  1. Open one of your own pets.
- **Expect:** No application form. A "Review applications" button links to /applications instead.

#### APP-004 · Withdraw a pending application and apply again

High · Release · Partially covered · Run when changed: applications

- **Before:** Signed in as Adopter with a pending application that is the only one for that pet. Seed data: Jelena withdraws her application for Kiki (consumes it: reset QA to repeat).
- **Steps:**
  1. On /applications under "My applications" click "Withdraw".
  2. Open the pet.
- **Expect:** Toast "Application withdrawn." Status "Withdrawn" with no buttons. The pet is "Available" again and shows the application form, so you can apply again.

#### APP-006 · Adopted pets cannot be applied for

Medium · Targeted · Covered by other automated tests · Run when changed: applications

- **Before:** Signed in as a user who did not apply for the adopted pet. Seed data: Marko opens Maxi (adopted by Jelena).
- **Steps:**
  1. Open the adopted pet.
- **Expect:** Status badge "Adopted" and no application form.

#### APP-002 · Application message validation

Medium · Targeted · Covered by other automated tests · Run when changed: applications

- **Before:** Signed in as Adopter, on an available pet.
- **Steps:**
  1. Click "Send application" with an empty message.
  2. Paste a message longer than 2000 characters and send.
- **Expect:** "Please write a short message." and "The message must be at most 2000 characters." No application is created.

#### APP-005 · A duplicate application is refused

Medium · Targeted · Partially covered · Run when changed: applications; http

- **Before:** Signed in as Adopter. The same available pet open in two tabs. Seed data: Jelena applies for Coco in two tabs.
- **Steps:**
  1. Send an application in tab 1.
  2. In tab 2 (still showing the form) send another one.
- **Expect:** Tab 2 shows "You have already applied for this pet." inline. Only one application exists.

### 5.6 Owner: reviewing applications

#### OWN-001 · The owner sees received applications with contact details

Critical · Smoke · Covered by Playwright · Run when changed: applications

- **Before:** Signed in as Owner. Adopter has applied for one of your pets. Seed data: Ana sees Jelena's application from APP-001 (or the one for Max).
- **Steps:**
  1. Click "Applications" in the header.
- **Expect:** Under "Applications for my pets" the application shows the pet name (link), "Submitted <date>", "Applicant: <name> (<email>)", the message, "Pending", and "Accept" and "Reject".

#### OWN-002 · Accepting adopts the pet and rejects the other applications

Critical · Release · Partially covered · Run when changed: applications

- **Before:** Signed in as Owner. Two pending applications for the same pet (Adopter and Adopter 2). Seed data: Rex has pending applications from Luka and Marko: accept Luka's (consumes Rex).
- **Steps:**
  1. Click "Accept" on Adopter's application.
  2. Look at Adopter 2's application and at the pet.
- **Expect:** Toast "Application accepted. The pet is now adopted." Adopter's application is "Accepted", Adopter 2's is "Rejected", neither has buttons. The pet is "Adopted". Adopter 2 sees "Rejected" under "My applications".

#### OWN-003 · Rejecting the last pending application makes the pet available

High · Release · Partially covered · Run when changed: applications

- **Before:** Signed in as Owner. A pet with exactly one pending application. Seed data: reject Luka's application for Toby (consumes it).
- **Steps:**
  1. Click "Reject" on it.
  2. Open the pet.
- **Expect:** Toast "Application rejected." Status "Rejected", no buttons. The pet is "Available". The rejected applicant sees "Rejected" and no new form for that pet.

#### OWN-004 · Application lists are paginated independently

High · Release · Partially covered · Run when changed: applications

- **Before:** Owner with more than 10 received applications (demo data: Ana has 11). Seed data: Ana (11 received applications).
- **Steps:**
  1. Open /applications.
  2. Click "Next" in "Applications for my pets".
  3. Refresh, then use Back.
- **Expect:** Page 2 shows the 11th application and "Page 2 of 2". The URL has receivedPage=2. "My applications" stays on its own page 1. Refresh keeps the page.

#### OWN-005 · Applications are private

High · Targeted · Covered by other automated tests · Run when changed: applications; auth

- **Before:** Adopter applied for an Owner pet. Signed in as Adopter 2 (not involved). Seed data: Marko does not see Jelena's application for Max.
- **Steps:**
  1. Open /applications.
- **Expect:** Neither list shows that application or the Adopter's email.

### 5.7 Language, errors and empty states

#### I18N-001 · Switch the language; it is remembered

High · Release · Partially covered · Run when changed: i18n

- **Before:** Any page.
- **Steps:**
  1. Choose "Srpski" in the language selector in the header.
  2. Navigate to another page, then refresh.
  3. Switch back to "English".
- **Expect:** The interface switches immediately (title "Udomljavanje ljubimaca", buttons and labels in Serbian) and stays Serbian after navigation and refresh. Pet names and descriptions are not translated (user content).

#### I18N-002 · Validation messages already on screen switch language

Medium · Targeted · Covered by other automated tests · Run when changed: i18n

- **Before:** On /login, signed out.
- **Steps:**
  1. Click "Sign in" with empty fields.
  2. Switch to "Srpski".
- **Expect:** "Email is required." changes to "Email je obavezan." without resubmitting.

#### ERR-001 · The API is unreachable

High · Release · Partially covered · Run when changed: http

- **Before:** On /pets. Use DevTools > Network > Offline (stopping the QA API would delete its data).
- **Steps:**
  1. Go offline and change a filter.
  2. Go online and change the filter again.
- **Expect:** After a few seconds (network errors are retried) "The server could not be reached. Check your connection and try again." Once online the list loads normally.

#### ERR-002 · Unknown pages and pet list pages past the end

Medium · Targeted · Covered by other automated tests · Run when changed: pet-list; routing

- **Before:** Any user.
- **Steps:**
  1. Open /does-not-exist.
  2. Open /pets?page=99.
  3. Open /pets?page=abc.
- **Expect:** "Page not found" with "Back to pets". page=99: "There are no pets on this page." with "Go to the first page". page=abc: page 1.

#### ERR-003 · No search results

Medium · Targeted · Covered by other automated tests · Run when changed: pet-list

- **Before:** On /pets.
- **Steps:**
  1. Search for "zzzz".
  2. Click "Clear filters".
- **Expect:** "No pets match your search." with "Clear filters"; clearing shows all pets again and empties the search box.

### 5.8 Docker

#### DOCKER-001 · All QA containers are healthy and the app is reachable

High · Docker · Manual only · Run when changed: docker

- **Before:** QA stack started with `pnpm qa:up`.
- **Steps:**
  1. Run `pnpm qa:ps`.
  2. Open http://127.0.0.1:3336/api/health.
  3. Open http://127.0.0.1:4203.
- **Expect:** mongodb, api and web are "healthy" and published on 127.0.0.1 only (ports 27019, 3336, 4203). Health returns {"status":"ok"}. The web app loads and shows the QA pets.

#### DOCKER-002 · Sign-in works between the built web app and the API

High · Docker · Manual only · Run when changed: docker; auth

- **Before:** QA stack running and seeded (`pnpm qa:seed`).
- **Steps:**
  1. Sign in at http://127.0.0.1:4203 as ana@demo.example.com.
  2. Refresh the page.
  3. Open /applications.
- **Expect:** You are signed in, still signed in after the refresh, and /applications loads. (This checks CORS, the session cookie on 127.0.0.1 and the API address built into the web image.) The same at http://localhost:4203 does not keep you signed in: that is expected, use 127.0.0.1.

#### DOCKER-003 · Deep links load directly (nginx)

Medium · Docker · Manual only · Run when changed: docker; routing

- **Before:** QA stack running.
- **Steps:**
  1. Open a pet page, copy its URL, and open it in a new tab.
  2. Refresh /applications and /does-not-exist.
- **Expect:** The pet page and /applications load directly instead of an nginx 404. /does-not-exist shows the app's "Page not found".

#### DOCKER-004 · Photos are stored in the volume and survive a restart

High · Docker · Manual only · Run when changed: docker; uploads

- **Before:** QA stack running and seeded. A small photo without personal metadata.
- **Steps:**
  1. Signed in as Ana, create a pet named "QA Docker <date>" with the photo.
  2. Run `pnpm qa:down`, then `pnpm qa:up`.
  3. Reload the pet page.
- **Expect:** The photo shows before and after the restart (URL under http://127.0.0.1:3336/uploads/pets/): stopping the QA stack keeps its data.
- **Cleanup:** Delete the "QA Docker" pet, or run `pnpm qa:reset --yes` and `pnpm qa:seed`.

## 6. What the automated tests cover

Checked against the specs on 2026-10-22. "Covered" means the rule and the UI behaviour are tested; it doesn't mean everything about the case is.

| Coverage                         | Cases                                                                                                                                                                                                                               | What I do                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Covered by Playwright            | AUTH-001, AUTH-004, AUTH-005, APP-001, OWN-001                                                                                                                                                                                      | Rely on E2E. They still appear in the smoke suite because that's the journey I demo.                                                                                   |
| Covered by other automated tests | AUTH-008, AUTH-010, PETS-007, PETS-008, PETS-010, UPL-003, UPL-005, APP-002, APP-003, APP-006, OWN-005, OWN-007, I18N-002, ERR-002, ERR-003                                                                                         | Rely on the API/component tests. Check by hand only to eyeball UI I changed.                                                                                           |
| Partially covered                | PETS-001, PETS-002, PETS-003, AUTH-002, AUTH-003, AUTH-006, AUTH-007, AUTH-009, PETS-004, PETS-005, PETS-006, PETS-009, UPL-001, UPL-002, UPL-004, UPL-006, APP-004, APP-005, OWN-002, OWN-003, OWN-004, OWN-006, I18N-001, ERR-001 | The rules are tested, but not the whole flow in a real browser (e.g. real photo upload, sessions across tabs, URL/Back behaviour). Test by hand when the area changes. |
| Manual only                      | ENV-001, AUTH-011, DOCKER-001, DOCKER-002, DOCKER-003, DOCKER-004                                                                                                                                                                   | No automated test (environment checks, the Docker deployment, redirects away from sign-in pages).                                                                      |

**Where the tests live:**

- **Playwright** (`apps/web-e2e/src/`):
  - register, sign in, wrong credentials
  - pet list with search and species filter
  - apply
  - owner sees and accepts an application, and the pet becomes adopted
- **API** (`apps/api/src/**/*.spec.ts`):
  - sessions, rate limits, origin check
  - pet rules and ownership, list paging and search
  - photos: type, size, the 5-photo limit (also with simultaneous uploads), adding, removing, replacing and clean-up
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
- **Photo metadata** (e.g. GPS) is kept as uploaded, a known limitation. Use photos without personal metadata.
