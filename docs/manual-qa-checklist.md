# Manual QA checklist

My guide for testing the app by hand. The test IDs match [manual-qa-test-cases.csv](manual-qa-test-cases.csv), which is the register I import into Excel to record results.

- **Smoke test** (section 3): about 5–10 minutes, after a change or before a demo.
- **Essential checklist** (section 4): about 20–30 minutes, before merging a bigger change or calling a version done.
- **Edge cases** (section 5): when the change touches that area.

All commands run in PowerShell in the repository root (the `pet-adoption-system` folder). UI text is quoted in English; switch the language back to English if you tested Serbian.

## 1. Environment

| Environment                    | Isolated from my data?                                              | Data after stopping                      | Use it for                                  |
| ------------------------------ | ------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| **Throwaway QA** (recommended) | Yes: in-memory database, temporary photo folder                     | Gone                                     | Routine manual QA                           |
| Demo (`pnpm demo:start`)       | Yes: database `pet-adoption-demo`, photos in `tmp/demo-uploads`     | Kept; reset with `pnpm demo:reset --yes` | QA that must survive a restart; demos       |
| Local development              | **No**: database `pet-adoption`, photos in `apps/api/uploads`       | Kept                                     | Development, not QA                         |
| Docker Compose                 | **No**: the same `pet-adoption` database, photos in a Docker volume | Kept                                     | Only checking the Docker setup (DOCKER-001) |

> **Never delete Docker volumes as part of QA.** `docker compose --profile app down -v`, `docker volume prune`, `docker system prune --volumes` and Docker Desktop's _Clean / Purge data_ delete the development database and photos. Routine QA never needs them.

### 1.1 Throwaway QA environment (recommended)

The same setup Playwright uses: the real API from source on port 3334 with a fresh in-memory MongoDB and a temporary photo folder, plus the web app on port 4201 pointed at it. It never touches MongoDB on 27018, `apps/api/uploads` or the Docker volumes.

**Needs:** Node.js 22, pnpm 12 and `pnpm install` done. Not needed: Docker or any `.env` file (the launcher sets the API's settings itself). The first start downloads the MongoDB binary, which needs internet.

```powershell
# Terminal 1: API on :3334 with an empty in-memory database. Wait for "[ ready ] http://localhost:3334".
pnpm exec tsx apps/web-e2e/src/support/start-api.ts
```

```powershell
# Terminal 2: web app on :4201, pointed at that API.
$env:VITE_API_URL = 'http://localhost:3334/api'
pnpm exec vite --config apps/web/vite.config.mts --port 4201 --strictPort
```

| What            | Address                              |
| --------------- | ------------------------------------ |
| Web app         | http://localhost:4201                |
| API health      | http://localhost:3334/api/health     |
| Uploaded photos | http://localhost:3334/uploads/pets/… |

**Stop:** Ctrl+C in both terminals. All QA data is gone; the next start is empty. If a terminal was closed another way and a port stays busy, find the process with `netstat -ano | findstr ":3334 :4201"` and end that `node` process.

**Limitations:**

- Restarting the API deletes everything, so don't stop terminal 1 in the middle of a run. To test network errors, use the browser's offline mode instead (ERR-001).
- It runs the code from source in development mode; it doesn't test the Docker images (use DOCKER-001 for that).
- Photos go to a `pet-adoption-e2e-…` folder in `%TEMP%`, which isn't cleaned up. It's harmless; delete it by hand if you like.
- It uses the E2E ports, so don't run `pnpm nx e2e @pet-adoption/web-e2e` at the same time.
- `$env:VITE_API_URL` stays set in terminal 2 until you close it.

### 1.2 Test data and accounts

Most cases need three accounts. A browser window holds one session, and tabs in the same window share it. Use a normal window, a private window and a second browser (or browser profile) to be signed in as three people at once.

| Role      | With the demo data (recommended) | Created by hand           |
| --------- | -------------------------------- | ------------------------- |
| Owner     | `ana@demo.example.com`           | `owner@qa.example.com`    |
| Adopter   | `jelena@demo.example.com`        | `adopter@qa.example.com`  |
| Adopter 2 | `luka@demo.example.com`          | `adopter2@qa.example.com` |
| Visitor   | signed out                       | signed out                |

**Option A: load the demo data into the QA environment** (with terminals 1 and 2 running):

```powershell
# Terminal 3
$env:DEMO_API_URL = 'http://localhost:3334/api'
pnpm demo:seed
```

- **What it creates:** 4 users, 14 pets and 13 applications. All demo accounts use the password `demo-password`.
- **Useful pets for the cases:**
  - Ana owns 9 pets and has 11 received applications, enough for OWN-004.
  - Rex (Ana's) has two pending applications, from Luka and Marko (OWN-002, OWN-006).
  - Bella and Luna are available (APP-001).
  - Maxi and Oscar are adopted (APP-006).
- **Photos:** the seed adds them only if files are in `apps/api/src/scripts/demo-images/`. Add yours via UPL-001.

**Option B: by hand (minimum):**

1. Register Owner, Adopter and Adopter 2 (AUTH-001). Use the example.com addresses above and a password of at least 8 characters that you use nowhere else.
2. As Owner, create 3 pets: "QA Max" (dog), "QA Luna" (cat), "QA Coco" (other).
3. PETS-003 and OWN-004 need more than 12 pets and more than 10 received applications; use option A for those.

**Sign-in limit:** sign-in and registration together allow 20 attempts per 15 minutes from your computer. The seed uses 8. Sign in once per role and keep those windows open. If "Too many attempts" appears, wait 15 minutes (restarting terminal 1 also resets it, but deletes the data). Run AUTH-010 last.

### 1.3 Demo environment (optional)

Isolated like the QA environment, but the data survives restarts. It's a separate `pet-adoption-demo` database on the development MongoDB server.

**Needs:** `docker compose up -d` (MongoDB) and `apps/api/.env` with `SESSION_SECRET`.

```powershell
pnpm demo:start   # web http://localhost:4202, API http://localhost:3335/api
pnpm demo:seed    # second terminal
```

`pnpm demo:reset` shows what it would delete; `pnpm demo:reset --yes` empties only the demo database and demo photos.

### 1.4 Local development (not isolated)

Uses the database `pet-adoption` on the Docker MongoDB (the same one the Docker stack uses) and photos in `apps/api/uploads/`. Photos are not shared with Docker. Commands are in the README, option B (`docker compose up -d`, `pnpm nx serve @pet-adoption/api`, `pnpm nx dev @pet-adoption/web`; web http://localhost:4200, API http://localhost:3333/api). Don't use it for QA: test records end up in your development data.

### 1.5 Docker Compose (only for DOCKER-001)

Runs MongoDB, the API and the web app in containers with **persistent volumes**. It uses the same `pet-adoption` database as local development, so it is not isolated.

1. **Needs:** Docker Desktop running, and a root `.env` (from `.env.example`) with `SESSION_SECRET` of at least 32 characters.
2. **Back up first** with the `mongodump` commands in the README.
3. **Start:** `docker compose --profile app up -d --build`
4. **Check status:** `docker compose --profile app ps`; all services should be "healthy".
5. **URLs:** web http://localhost:4200, API health http://localhost:3333/api/health.
6. **Stop:** `docker compose --profile app down`, which keeps the data. Never add `-v`.
7. **Port clash:** the local dev servers use the same ports, so stop them first.

## 2. How I run QA

1. **Start** the throwaway QA environment (1.1).
2. **Prepare data:** seed it (1.2, option A) and sign in as Owner, Adopter and Adopter 2 in separate windows.
3. **Test:** run the smoke test (section 3) plus the cases for the area I changed (filter the CSV by Category).
4. **Record** each result as Pass, Fail or Blocked, with the date and, for a failure, a bug reference (a GitHub issue number or a short note).
5. **Re-run** failed cases after the fix, and repeat the smoke test.
6. **Keep** the results of important runs (before a demo, before merging to `master`) so I can compare them later.

### Recording results in Excel

The CSV is the catalog. It never holds results, so it can be updated in Git without losing them.

1. Keep a workbook outside the repository, e.g. `Documents\pet-adoption-qa\qa-runs.xlsx`.
2. **Import:** _Data → From Text/CSV_, choose `docs/manual-qa-test-cases.csv`, set _File origin_ to "65001: Unicode (UTF-8)" and _Delimiter_ to "Comma", then _Load_. (Double-clicking the file may split columns wrongly if Windows uses `;` as its list separator.) Name the sheet `Catalog`.
3. **For each run,** copy the catalog into a new sheet named after the date and purpose (e.g. `2026-10-21 smoke`). Add the columns `Result`, `Date`, `Commit` (from `git rev-parse --short HEAD`), `Bug` and `Notes`. Filter by `Test Type` or `Category` and fill in only the cases I ran.
4. **Retest:** filter the last run for `Result = Fail`, copy those rows into a new sheet (`… retest`) and test again after the fix.
5. **Compare runs** (optional): in a summary sheet, look up each Test ID's result per run, e.g. `=XLOOKUP($A2,'2026-10-21 smoke'!$A:$A,'2026-10-21 smoke'!$J:$J,"")`.
6. **When the CSV changes** (new or reworded cases), import it again as a new `Catalog` sheet. Old run sheets stay as they were.

## 3. Smoke test (5–10 minutes)

Details for each case are in section 4. With demo data loaded, skip AUTH-001 or use a new address.

- [ ] **ENV-001** The QA environment starts and is isolated
- [ ] **PETS-001** A visitor browses the pet list and opens a pet
- [ ] **AUTH-001** Register a new account
- [ ] **AUTH-004** Sign in with valid credentials
- [ ] **AUTH-006** The session survives a refresh and a new tab
- [ ] **AUTH-007** Sign out
- [ ] **PETS-004** Create a pet
- [ ] **UPL-001** Add a photo when creating a pet
- [ ] **APP-001** Apply to adopt another user's pet
- [ ] **OWN-001** The owner sees received applications with contact details
- [ ] **I18N-001** Switch the language; it is remembered

## 4. Essential checklist (20–30 minutes)

Run in this order: the later groups use data created by the earlier ones. With hand-made data (option B), do 4.2 and 4.3 before 4.1.

### 4.0 Start

#### ENV-001 · The QA environment starts and is isolated

Critical · Smoke · Manual only

- **Before:** Throwaway QA environment started (section 1).
- **Steps:**
  1. Open http://localhost:3334/api/health.
  2. Open http://localhost:4201.
- **Expect:** Health returns {"status":"ok"}. The web app loads with the header "Pet Adoption". The pet list is empty, or shows only the demo pets if you seeded.

### 4.1 Visitor (signed out)

#### PETS-001 · A visitor browses the pet list and opens a pet

Critical · Smoke · Covered by Playwright

- **Before:** Signed out. At least 2 pets exist.
- **Steps:**
  1. Open /pets.
  2. Click "View details" on a pet.
  3. Click "Back to pets".
- **Expect:** Cards show name, species, age, status and photo or "No image available". The detail page shows the description and status badge. Edit and Delete are not shown. The adoption section says "Interested in adopting <name>? Sign in to apply".

#### PETS-002 · Search, filter and sort the pet list

High · Regression · Partially covered

- **Before:** Pets with similar names and different species/status exist (e.g. demo data: Max, Maxi, Bella, Bello).
- **Steps:**
  1. Type part of a name in "Search pets by name..." and wait a moment.
  2. Choose a species in "Filter by species".
  3. Choose a status in "Filter by status".
  4. Change "Sort by" to each option.
- **Expect:** Results update after you stop typing and match case-insensitively anywhere in the name. "<n> pets found" matches the cards. Filters combine with the search. Sort order follows the chosen option. The URL contains the search, filters and sort.

#### PETS-003 · Pet list pagination keeps its state in the URL

High · Regression · Partially covered

- **Before:** More than 12 pets exist (demo data has 14).
- **Steps:**
  1. On /pets click "Next".
  2. Open a pet on page 2, then use the browser Back button.
  3. Refresh the page.
  4. Change a filter.
- **Expect:** "Page 2 of 2" is shown and the URL has page=2. Back and refresh return to the same page with the same filters. Changing a filter goes back to page 1. "Previous" is disabled on page 1 and "Next" on the last page.

### 4.2 Accounts and sessions

#### AUTH-001 · Register a new account

Critical · Smoke · Covered by Playwright

- **Before:** Signed out. An email address not registered yet.
- **Steps:**
  1. Click "Register".
  2. Fill Name, Email and a password of at least 8 characters.
  3. Click "Create account".
- **Expect:** You land on /pets, signed in. The header shows your name, "Applications" and "Sign out". A welcome toast appears.

#### AUTH-002 · Registration form validation

High · Regression · Partially covered

- **Before:** Signed out, on /register.
- **Steps:**
  1. Click "Create account" with all fields empty.
  2. Enter an invalid email and a 5-character password, submit again.
- **Expect:** Empty form: "Name is required.", "Email is required." and "Password must be at least 8 characters." Second attempt: "Enter a valid email address." and the password message. No request is sent and no account is created.

#### AUTH-004 · Sign in with valid credentials

Critical · Smoke · Covered by Playwright

- **Before:** An existing account. Signed out.
- **Steps:**
  1. Click "Sign in".
  2. Enter email and password.
  3. Click "Sign in".
- **Expect:** You land on /pets, signed in. Toast "Welcome back, <name>!".

#### AUTH-005 · Sign in with a wrong password

High · Regression · Covered by Playwright

- **Before:** An existing account. Signed out.
- **Steps:**
  1. Sign in with the right email and a wrong password.
- **Expect:** Inline error "Incorrect email or password." You stay on /login, signed out.

#### AUTH-006 · The session survives a refresh and a new tab

Critical · Smoke · Partially covered

- **Before:** Signed in.
- **Steps:**
  1. Refresh the page.
  2. Open http://localhost:4201/applications in a new tab of the same browser window.
- **Expect:** You are still signed in in both tabs. The Applications page loads without asking you to sign in.

#### AUTH-007 · Sign out

Critical · Smoke · Partially covered

- **Before:** Signed in, on /applications.
- **Steps:**
  1. Click "Sign out".
  2. Open /applications again (or use the browser Back button).
- **Expect:** Toast "You have been signed out." The header shows "Sign in" and "Register". /applications redirects to /login.

#### AUTH-008 · Protected pages redirect to sign-in and return afterwards

High · Regression · Covered by other automated tests

- **Before:** Signed out.
- **Steps:**
  1. Open /pets/new.
  2. Sign in on the page you are sent to.
- **Expect:** You are redirected to /login. After signing in you are back on /pets/new ("Add a pet"). The same works for /applications.

### 4.3 Owner: listings and photos

#### PETS-004 · Create a pet

Critical · Smoke · Partially covered

- **Before:** Signed in as Owner.
- **Steps:**
  1. Click "Add a pet".
  2. Fill Name, Species, Age (whole number) and Description.
  3. Click "Create pet".
- **Expect:** Toast "Pet created successfully." You land on the new pet's page with status "Available" and the Edit and Delete controls. The pet appears at the top of /pets (newest first).

#### PETS-005 · Pet form validation

High · Regression · Partially covered

- **Before:** Signed in, on "Add a pet".
- **Steps:**
  1. Click "Create pet" with empty fields.
  2. Enter age "-1" or "2.5" and submit.
- **Expect:** Messages "Name is required.", "Age is required." / "Age must be a non-negative whole number." and "Description is required." appear. Nothing is saved.

#### PETS-006 · Edit a pet

Critical · Regression · Partially covered

- **Before:** Signed in as Owner, on one of your pets.
- **Steps:**
  1. Click "Edit pet".
  2. Change name, age and description.
  3. Click "Save changes".
- **Expect:** Toast "Pet updated successfully." The detail page and the list show the new values. The status is unchanged.

#### PETS-007 · Delete a pet after confirming

High · Regression · Partially covered

- **Before:** Signed in as Owner, a pet with no pending or accepted applications.
- **Steps:**
  1. On the pet page click "Delete".
  2. Click "Cancel".
  3. Click "Delete" again, then "Yes, delete".
- **Expect:** Cancel keeps the pet. After confirming, toast "<name> was deleted.", you are taken to the list and the pet is gone.

#### PETS-008 · Other users cannot edit or delete a pet

High · Regression · Covered by other automated tests

- **Before:** Signed in as Adopter. A pet owned by Owner.
- **Steps:**
  1. Open the Owner's pet.
  2. Open /pets/<that pet id>/edit directly.
- **Expect:** No Edit or Delete controls on the pet page. The edit URL shows "You can only edit pets you posted." without a form.

#### UPL-001 · Add a photo when creating a pet

Critical · Smoke · Partially covered

- **Before:** Signed in as Owner. A JPEG or PNG under 5 MB without personal metadata.
- **Steps:**
  1. On "Add a pet" fill the fields and choose the photo in "Photo (optional)".
  2. Click "Create pet".
- **Expect:** A preview appears before saving. After saving, the photo shows on the pet page and on the card in the list. Opening the image in a new tab works (URL under http://localhost:3334/uploads/pets/).

#### UPL-002 · Replace and remove a photo

High · Regression · Partially covered

- **Before:** Signed in as Owner, a pet with a photo.
- **Steps:**
  1. Edit the pet, choose a different photo, save.
  2. Edit again, click "Remove photo", save.
- **Expect:** After replacing, the new photo is shown everywhere. After removing, the pet shows "No image available". Each save shows "Pet updated successfully."

### 4.4 Adopter: applying

#### APP-001 · Apply to adopt another user's pet

Critical · Smoke · Covered by Playwright

- **Before:** Signed in as Adopter. An available pet owned by Owner.
- **Steps:**
  1. Open the pet.
  2. Write a message in "Why would you like to adopt <name>?".
  3. Click "Send application".
- **Expect:** Toast "Your application was sent." The section shows "Your application:" "Pending" and "Withdraw". The pet status becomes "Pending". The application is listed under "My applications".

#### APP-003 · Owners cannot apply for their own pet

High · Regression · Covered by other automated tests

- **Before:** Signed in as Owner.
- **Steps:**
  1. Open one of your own pets.
- **Expect:** No application form. A "Review applications" button links to /applications instead.

#### APP-004 · Withdraw a pending application and apply again

High · Regression · Partially covered

- **Before:** Signed in as Adopter with a pending application that is the only one for that pet.
- **Steps:**
  1. On /applications under "My applications" click "Withdraw".
  2. Open the pet.
- **Expect:** Toast "Application withdrawn." Status "Withdrawn" with no buttons. The pet is "Available" again and shows the application form, so you can apply again.

#### APP-006 · Adopted pets cannot be applied for

Medium · Regression · Covered by other automated tests

- **Before:** Signed in as Adopter 2. A pet that is "Adopted" (not applied for by you).
- **Steps:**
  1. Open the adopted pet.
- **Expect:** Status badge "Adopted" and no application form.

### 4.5 Owner: reviewing applications

#### OWN-001 · The owner sees received applications with contact details

Critical · Smoke · Covered by Playwright

- **Before:** Signed in as Owner. Adopter has applied for one of your pets.
- **Steps:**
  1. Click "Applications" in the header.
- **Expect:** Under "Applications for my pets" the application shows the pet name (link), "Submitted <date>", "Applicant: <name> (<email>)", the message, "Pending", and "Accept" and "Reject".

#### OWN-002 · Accepting adopts the pet and rejects the other applications

Critical · Regression · Partially covered

- **Before:** Signed in as Owner. Two pending applications for the same pet (Adopter and Adopter 2).
- **Steps:**
  1. Click "Accept" on Adopter's application.
  2. Look at Adopter 2's application and at the pet.
- **Expect:** Toast "Application accepted. The pet is now adopted." Adopter's application is "Accepted", Adopter 2's is "Rejected", neither has buttons. The pet is "Adopted". Adopter 2 sees "Rejected" under "My applications".

#### OWN-003 · Rejecting the last pending application makes the pet available

High · Regression · Partially covered

- **Before:** Signed in as Owner. A pet with exactly one pending application.
- **Steps:**
  1. Click "Reject" on it.
  2. Open the pet.
- **Expect:** Toast "Application rejected." Status "Rejected", no buttons. The pet is "Available". The rejected applicant sees "Rejected" and no new form for that pet.

#### OWN-004 · Application lists are paginated independently

High · Regression · Partially covered

- **Before:** Owner with more than 10 received applications (demo data: Ana has 11).
- **Steps:**
  1. Open /applications.
  2. Click "Next" in "Applications for my pets".
  3. Refresh, then use Back.
- **Expect:** Page 2 shows the 11th application and "Page 2 of 2". The URL has receivedPage=2. "My applications" stays on its own page 1. Refresh keeps the page.

#### OWN-005 · Applications are private

High · Regression · Covered by other automated tests

- **Before:** Adopter applied for an Owner pet. Signed in as Adopter 2 (not involved).
- **Steps:**
  1. Open /applications.
- **Expect:** Neither list shows that application or the Adopter's email.

### 4.6 Language

#### I18N-001 · Switch the language; it is remembered

High · Smoke · Partially covered

- **Before:** Any page.
- **Steps:**
  1. Choose "Srpski" in the language selector in the header.
  2. Navigate to another page, then refresh.
  3. Switch back to "English".
- **Expect:** The interface switches immediately (title "Udomljavanje ljubimaca", buttons and labels in Serbian) and stays Serbian after navigation and refresh. Pet names and descriptions are not translated (user content).

## 5. Edge cases (less frequent)

### 5.1 Accounts and sessions

#### AUTH-003 · Register with an email that already exists

High · Edge Case · Partially covered

- **Before:** An existing account (e.g. Owner).
- **Steps:**
  1. Signed out, register again with the same email in different letter case (e.g. OWNER@...).
- **Expect:** Inline error "An account with this email already exists." You stay signed out on /register.

#### AUTH-009 · Signing out in one tab affects the other tab

Medium · Edge Case · Partially covered

- **Before:** Signed in, two tabs open on a pet you could apply for.
- **Steps:**
  1. Sign out in tab 1.
  2. In tab 2 (still showing the signed-in view) submit an application or save a form.
- **Expect:** Nothing is saved. Tab 2 switches to the signed-out state: the pet page shows "Sign in to apply" (an error "Please sign in to continue." may show briefly); a form page redirects to /login.

#### AUTH-010 · Repeated failed sign-ins are rate-limited

Medium · Edge Case · Covered by other automated tests

- **Before:** An existing account. Run this last: it blocks that account from this IP for 15 minutes.
- **Steps:**
  1. Sign in with a wrong password 6 times for the same email.
- **Expect:** Attempts 1-5 show "Incorrect email or password."; the 6th shows "Too many attempts. Please wait a few minutes and try again."
- **Cleanup:** Wait 15 minutes, or restart the QA API (this also deletes all QA data).

#### AUTH-011 · Signed-in users are sent away from sign-in and register pages

Medium · Edge Case · Manual only

- **Before:** Signed in.
- **Steps:**
  1. Open /login.
  2. Open /register.
- **Expect:** Both pages immediately redirect you (to /pets) instead of showing the forms.

### 5.2 Listings, photos and decisions

#### PETS-009 · A pet with an active application cannot be deleted

High · Edge Case · Partially covered

- **Before:** Signed in as Owner, a pet with a pending (or accepted) application.
- **Steps:**
  1. On the pet page click "Delete", then "Yes, delete".
- **Expect:** Error toast "This pet has open or accepted adoption applications and cannot be deleted." The pet stays.

#### PETS-010 · Edit page for a missing pet or failed load

Medium · Edge Case · Covered by other automated tests

- **Before:** Signed in.
- **Steps:**
  1. Open /pets/aaaaaaaaaaaaaaaaaaaaaaaa/edit (valid-looking id that does not exist).
  2. Open your own pet's edit page with the browser offline (DevTools > Network > Offline), then go online and click "Try again".
- **Expect:** Missing pet: "Pet not found" and "Back to pets", no "Try again". Offline: "The server could not be reached. Check your connection and try again." with "Try again", which loads the form once online.

#### UPL-003 · Wrong file type or too large a file is refused before upload

High · Edge Case · Manual only

- **Before:** Signed in, on the pet form. A GIF (or PDF) and an image larger than 5 MB.
- **Steps:**
  1. Choose the GIF/PDF (switch the file dialog to "All files"; it offers only JPEG, PNG and WebP).
  2. Choose the large image.
- **Expect:** "Choose a JPEG, PNG or WebP image." and "The photo must be at most 5 MB." respectively. No preview; the file is not sent.

#### UPL-004 · A non-image renamed to .png is rejected by the server

Medium · Edge Case · Partially covered

- **Before:** Signed in, on "Add a pet". A text file renamed to fake.png.
- **Steps:**
  1. Fill the form, choose fake.png, click "Create pet".
- **Expect:** The pet is created, then the toast says "The pet was saved, but the photo was not: Only JPEG, PNG and WebP photos are supported." The pet has no photo. (Assumes the browser reports the type from the extension, so the client check passes; unverified.)

#### OWN-006 · A stale decision in a second tab is refused

Medium · Edge Case · Partially covered

- **Before:** Signed in as Owner. Two pending applications for one pet; /applications open in two tabs.
- **Steps:**
  1. Tab 1: accept application 1.
  2. Tab 2 (not refreshed): click "Reject" on application 1, then "Accept" on application 2.
- **Expect:** Reject shows the error toast "This application has already been decided or withdrawn." Accept shows "This pet is no longer available for adoption." Nothing changes; refresh tab 2 to see application 1 "Accepted" and application 2 "Rejected".

#### OWN-007 · Empty application lists and a page past the end

Medium · Edge Case · Covered by other automated tests

- **Before:** Signed in as a user with no applications.
- **Steps:**
  1. Open /applications.
  2. Open /applications?receivedPage=9 as a user with some received applications.
- **Expect:** "No one has applied for your pets yet." and "You haven't applied to adopt any pets yet." Past the end: "There are no applications on this page." with "Go to the first page".

### 5.3 Applying

#### APP-002 · Application message validation

Medium · Edge Case · Covered by other automated tests

- **Before:** Signed in as Adopter, on an available pet.
- **Steps:**
  1. Click "Send application" with an empty message.
  2. Paste a message longer than 2000 characters and send.
- **Expect:** "Please write a short message." and "The message must be at most 2000 characters." No application is created.

#### APP-005 · A duplicate application is refused

Medium · Edge Case · Partially covered

- **Before:** Signed in as Adopter. The same available pet open in two tabs.
- **Steps:**
  1. Send an application in tab 1.
  2. In tab 2 (still showing the form) send another one.
- **Expect:** Tab 2 shows "You have already applied for this pet." inline. Only one application exists.

### 5.4 Errors, empty states and language

#### I18N-002 · Validation messages already on screen switch language

Medium · Edge Case · Covered by other automated tests

- **Before:** On /login, signed out.
- **Steps:**
  1. Click "Sign in" with empty fields.
  2. Switch to "Srpski".
- **Expect:** "Email is required." changes to "Email je obavezan." without resubmitting.

#### ERR-001 · The API is unreachable

High · Edge Case · Partially covered

- **Before:** On /pets. Use DevTools > Network > Offline (stopping the QA API would delete its data).
- **Steps:**
  1. Go offline and change a filter.
  2. Go online and change the filter again.
- **Expect:** After a few seconds (network errors are retried) "The server could not be reached. Check your connection and try again." Once online the list loads normally.

#### ERR-002 · Unknown pages and pet list pages past the end

Medium · Edge Case · Covered by other automated tests

- **Before:** Any user.
- **Steps:**
  1. Open /does-not-exist.
  2. Open /pets?page=99.
  3. Open /pets?page=abc.
- **Expect:** "Page not found" with "Back to pets". page=99: "There are no pets on this page." with "Go to the first page". page=abc: page 1.

#### ERR-003 · No search results

Medium · Edge Case · Covered by other automated tests

- **Before:** On /pets.
- **Steps:**
  1. Search for "zzzz".
  2. Click "Clear filters".
- **Expect:** "No pets match your search." with "Clear filters"; clearing shows all pets again and empties the search box.

## 6. Docker deployment check (only when needed)

#### DOCKER-001 · The Docker stack runs the main journeys

High · Regression · Manual only

- **Before:** Only when verifying the Docker setup. Back up first (README) - this uses persistent data.
- **Steps:**
  1. Start the Docker stack (section 1).
  2. Check http://localhost:3333/api/health and http://localhost:4200.
  3. Sign in, create a pet with a photo, apply as a second user, accept.
- **Expect:** All containers are "healthy". The journeys behave as in the QA environment; the photo URL is under http://localhost:3333/uploads/pets/ and still shows after `docker compose --profile app restart`.
- **Cleanup:** Delete the test pet if it has no active application. Never use `down -v` on your normal environment.

## 7. When to rely on the automated tests

The "Automation Coverage" column in the CSV says which cases the automated tests already cover:

| Value                            | Meaning                                                       | What I do                                                                                         |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Covered by Playwright            | An E2E test runs this journey in a real browser               | Rely on `pnpm nx e2e @pet-adoption/web-e2e`; test by hand only in the smoke test or before a demo |
| Covered by other automated tests | API or component tests check the rule, without a real browser | Rely on `pnpm nx run-many -t test`; test by hand only if the UI around it changed                 |
| Partially covered                | Rules are tested, but not the full flow in a real browser     | Test by hand when the area changes                                                                |
| Manual only                      | No automated test                                             | Test by hand when the area changes                                                                |

**Where the automated coverage lives:**

- **Playwright** (`apps/web-e2e/src/`):
  - register, sign in, wrong credentials
  - browse/search/species filter
  - apply
  - owner accepts and the pet becomes adopted
- **API** (`apps/api/src/**/*.spec.ts`):
  - authentication: sessions, rate limits, origin check
  - pet rules and ownership
  - pagination and search
  - photo upload: type check, size limit, replace and clean-up
  - every application rule and state transition, including transactions and concurrent decisions
- **Web components** (`apps/web/src/**/*.spec.tsx`):
  - forms and their validation
  - redirects to sign-in
  - error and empty states
  - pagination controls
  - the language selector

**Prefer automated tests** for rules (validation, permissions, status changes), concurrency, server errors and anything I would otherwise repeat after every change. Run them per the testing policy in `CLAUDE.md`.

**Keep manual testing** for what only a real browser shows: photo upload and display, sessions across tabs and refreshes, layout and feedback (toasts, loading), language persistence, and the Docker setup.

## 8. Not covered here

- **Server errors (HTTP 500)** can't be triggered by hand without changing code. The unit tests cover how the app shows them, and `query-client.spec.ts` covers its retries.
- **Two owners' decisions at the same instant** can't be reproduced reliably by hand; the API concurrency tests cover it. OWN-006 checks the stale-tab case.
- **UPL-004** assumes the browser reports a renamed file's type from its extension. That's typical, but not verified for every browser.
- **Session expiry** after 7 days, and legacy pets without an owner, can't practically be produced through the app.
- **Mobile layout and accessibility:** no requirements are documented; check visually if needed.
- **Photo metadata** (e.g. GPS) is kept as uploaded, a known limitation. Use photos without personal metadata.
