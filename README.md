# Pet Adoption System

[![CI](https://github.com/BojanSovtic/pet-adoption-system/actions/workflows/ci.yml/badge.svg)](https://github.com/BojanSovtic/pet-adoption-system/actions/workflows/ci.yml)

A full-stack web app where people post pets that need a new home, others apply to adopt them, and the person who posted the pet reviews the applications and accepts one.

- **Visitors** browse, search and filter pets without an account.
- **Signed-in users** post pets (with up to 5 photos), apply to adopt other people's pets, and withdraw their applications.
- **Pet owners** see who applied, with their contact details, and accept or reject applications. Accepting one adopts the pet and rejects the others.

The interface is available in English and Serbian. The full rules are in [docs/requirements.md](docs/requirements.md).

## Screenshots

<!--
  Screenshots are not captured yet. To add them:
  1. Start Docker QA and load the demo data (see "Docker QA environment" below).
  2. Save PNGs in docs/screenshots/ with these names:
       pet-list.png       the pet list with search and filters
       pet-details.png    a pet's page with the apply form
       applications.png   the Applications page (owner view)
  3. Replace this comment with:
       ![Pet list](docs/screenshots/pet-list.png)
       ![Pet details](docs/screenshots/pet-details.png)
       ![Applications](docs/screenshots/applications.png)
-->

_Screenshots coming soon._

## Technical highlights

- **Consistent adoption decisions.** Submitting, accepting, rejecting and withdrawing each run in one MongoDB transaction that locks the pet first. Two simultaneous acceptances can't both succeed, and a unique index is the final guarantee. This is covered by concurrency tests.
- **State machines shared by API and UI.** Application and pet statuses change only through explicit actions (`accept`, `reject`, `withdraw`) defined once in a shared TypeScript library. The API enforces them and the UI uses them to decide which buttons to show.
- **Server-side sessions.** HttpOnly session cookie, Argon2id password hashing, a new session id on sign-in, `SameSite` plus an `Origin` check against CSRF, and rate limits on sign-in and registration.
- **Authorization on the server.** Owner and applicant ids always come from the session. Owners see applicants' email addresses; nobody else can see an application.
- **One error contract.** The API returns stable error codes (`{ code, details? }`) and never display text; the web app translates them, including field-level validation errors.
- **Server-side search and pagination.** The pet list and both application lists are paginated with stable ordering and matching indexes. The pet list keeps its state in the URL.
- **Isolated tests.** API tests run against an in-memory MongoDB replica set, so transactions are real and no database setup is needed. Playwright E2E tests start their own API and web servers with a throwaway database.

Architecture diagrams (system, request pipeline, authentication, data model, adoption workflow, Docker, E2E): [docs/architecture.md](docs/architecture.md).

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, React Router 6, TanStack Query, Axios, Tailwind CSS 4 + shadcn/ui, react-i18next, zod
- **Backend:** Node.js 22, Express 4, MongoDB 8 with Mongoose 9, express-session + connect-mongo, Argon2, multer
- **Shared:** a TypeScript library with the API types, constants and state machines
- **Tooling:** Nx monorepo with pnpm, Vitest + Testing Library + Supertest, Playwright, ESLint, Prettier, Docker Compose, GitHub Actions

## Project structure

```text
apps/api              Express API
apps/web              React app
apps/web-e2e          Playwright end-to-end tests
packages/shared/models  Types and rules shared by the API and the web app
docs/                 Requirements, architecture, deployment notes, progress
```

## Running the app

Three environments, each for one job. They use different ports and data, so they can run at the same time.

|           | Local development                                     | Docker QA                                        | E2E tests                           |
| --------- | ----------------------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| Use for   | Writing code (hot reload)                             | Testing the built app by hand; showing the app   | Automated browser tests             |
| Runs      | MongoDB in Docker, API and web app with Node.js       | Everything in Docker, built like a deployment    | Its own servers, started by the run |
| Web / API | http://localhost:4200 / :3333                         | **http://127.0.0.1:4203** / :3336                | localhost:4201 / :3334              |
| Data      | Database `pet-adoption` (port 27018), `apps/api/uploads/` | Its own MongoDB server and volumes           | In memory, thrown away              |
| Start     | See [Local development](#local-development)           | `pnpm qa:up` (see [Docker QA](#docker-qa-environment)) | `pnpm nx e2e @pet-adoption/web-e2e` |

### Local development

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running), Git, Node.js 22 and pnpm 12. Run the commands in the repository root (the `pet-adoption-system` folder).

```sh
pnpm install
cp apps/api/.env.example apps/api/.env   # then set SESSION_SECRET in it (32+ characters)
cp apps/web/.env.example apps/web/.env
docker compose up -d                     # MongoDB only (replica set on port 27018)
pnpm nx serve @pet-adoption/api          # API: http://localhost:3333/api
pnpm nx dev @pet-adoption/web            # web app: http://localhost:4200 (in a second terminal)
pnpm dev:seed                            # optional, while the API runs: demo users, pets, applications
```

A `SESSION_SECRET` can come from a password generator, or from `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. The API refuses to start without it.

- **The development database starts empty.** `pnpm dev:seed` fills it with the [demo data](#demo-data). It only adds what is missing, so it is safe to run again.
- **Stop** the dev servers with Ctrl+C. `docker compose stop` stops MongoDB and keeps its data; `docker compose up -d` starts it again.
- **Your data** lives in the Docker volume `pet-adoption-system_mongodb_data` (photos in `apps/api/uploads/`). `docker compose down -v`, `docker volume prune`, `docker system prune --volumes` and Docker Desktop's _Clean / Purge data_ **delete it**. To back up the database first:

  ```sh
  docker exec pet-adoption-mongodb mongodump --db pet-adoption --archive=/tmp/pet-adoption.archive
  docker cp pet-adoption-mongodb:/tmp/pet-adoption.archive ./pet-adoption.archive
  ```

  To restore it: `docker cp ./pet-adoption.archive pet-adoption-mongodb:/tmp/pet-adoption.archive`, then `docker exec pet-adoption-mongodb mongorestore --archive=/tmp/pet-adoption.archive`.

| Problem                                                                   | What to do                                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot connect to the Docker daemon`, `error during connect`             | Docker Desktop isn't running. Start it and wait until it says it's running.                                                        |
| The API stops with `SESSION_SECRET is required`                           | `apps/api/.env` is missing or `SESSION_SECRET` is shorter than 32 characters.                                                      |
| "Port 3333 … is already in use", or the web dev server won't start on 4200 | Something else uses the port. Find it with `netstat -ano \| findstr :3333` (Windows) / `lsof -i :3333` (macOS/Linux).             |
| The page shows "The server could not be reached"                          | The API isn't running. Start `pnpm nx serve @pet-adoption/api`.                                                                    |
| The API log mentions MongoDB or a replica set                             | MongoDB isn't ready: `docker compose ps` should show it "healthy". The first start initialises the replica set, which takes a few seconds. |

### Administrators

Every new account is an ordinary user, and registration ignores any `role` field. Admins open the administration area (**Admin** in the header, `/admin`). The first admin is created from the command line by someone with access to the server's configuration:

1. The person registers in the app as usual. No passwords or default accounts are stored in the repository.
2. On the machine with the API's settings (`apps/api/.env`, or the API container's environment), from the repository root:

   ```sh
   pnpm admin:grant person@example.com         # dry run: shows the database (host/name, no credentials), the user and the change
   pnpm admin:grant person@example.com --yes   # applies it
   pnpm admin:revoke person@example.com --yes  # removes it again
   ```

3. The change applies to the person's next request; no new sign-in is needed. After that, admins can grant or remove admin access on the **Users** page.

Safety:
- Check the database line of the dry run before adding `--yes`: the command uses `MONGODB_URI` from the environment, so in a shell with production settings it changes production.
- Nobody can change their own role, and the last admin can't be revoked (the command and the app refuse).
- Every change, from the app or the command line, is recorded in the admin **Audit log** (also under **Recent admin activity** on the overview).
- The command needs only `MONGODB_URI` (from the environment or `apps/api/.env`), plus `AUDIT_HMAC_KEY` if the API uses one. It doesn't need the web server's settings. For Docker QA, point it at the QA MongoDB port: `MONGODB_URI="mongodb://127.0.0.1:27019/pet-adoption-qa?directConnection=true" pnpm admin:grant …` (in PowerShell, set `$env:MONGODB_URI` first).

In the app, admins can also **suspend** accounts and **hide** listings (both reversible, see [requirements](docs/requirements.md#administration)).

**Audit log integrity:** entries form a hash chain. Set `AUDIT_HMAC_KEY` (32+ random characters, kept outside the database) to sign them, and check the chain with:

```sh
pnpm audit:verify   # exit code 1 if an entry was changed, removed or reordered in the database
```

This detects tampering; it doesn't prevent it. Anyone with database write access can still delete recent entries (see [production-readiness.md](docs/production-readiness.md), A3).

### Demo data

4 users, 14 pets (11 with photos) and 13 adoption applications in every status, including an auto-rejected and a withdrawn one. Load it with `pnpm dev:seed` (local development) or `pnpm qa:seed` (Docker QA). It goes through the normal API, so it passes the same validation and rules as real use, and it only adds what is missing.

Sign in as `ana@demo.example.com` (owner with the most pets and applications), `marko@demo.example.com`, `jelena@demo.example.com` or `luka@demo.example.com`. All four use the demo-only password `demo-password`.

- **Changed by hand?** The seed reports differences instead of guessing (decisions are final). In QA, start over with `pnpm qa:reset --yes` and seed again. The development database has no reset command on purpose.
- **Photos:** up to 5 per pet from [apps/api/src/scripts/demo-images/](apps/api/src/scripts/demo-images/README.md) (`max.jpg`, `max-2.jpg`, …). `pnpm demo:images` copies downloaded images to those names as listed in `mapping.json`. The seed adds photos only to pets that have none yet.
- **Rate limits:** sign-in and registration allow 20 attempts per 15 minutes from one IP. A first seed uses 8 and a rerun 4. If the seed reports the limit, wait or restart the API.

## Docker QA environment

A separate Docker stack for manual QA and for showing the app. It runs the built images (the web app on nginx, the bundled API), as a deployment would, with **its own MongoDB server, database, network and photo storage**, so testing never touches your development data.

|                                    | Docker QA                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| Web app (open this)                | **http://127.0.0.1:4203**                                                                        |
| API health check                   | http://127.0.0.1:3336/api/health                                                                 |
| MongoDB, for tools such as Compass | `mongodb://127.0.0.1:27019/pet-adoption-qa?directConnection=true`                                |
| Compose file / project             | `docker-compose.qa.yml` / `pet-adoption-qa`                                                      |
| Containers                         | `pet-adoption-qa-mongodb`, `pet-adoption-qa-api`, `pet-adoption-qa-web`                          |
| Database                           | `pet-adoption-qa` on its own MongoDB server                                                      |
| Volumes                            | `pet-adoption-qa_mongodb_data`, `pet-adoption-qa_mongodb_config`, `pet-adoption-qa_uploads_data` |

Use `127.0.0.1`, **not** `localhost`. The API only accepts the web app from `http://127.0.0.1:4203`. Browsers also keep cookies per host name, not per port, so this keeps your QA sign-in separate from development on `localhost`.

### Setup (once)

**Prerequisites:** Docker Desktop (running), Node.js 22, pnpm 12, and `pnpm install` (the `qa:*` commands are pnpm scripts).

Add `QA_SESSION_SECRET` to the root `.env` (see `.env.example`). Use at least 32 random characters, different from the development `SESSION_SECRET` in `apps/api/.env`:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The QA stack refuses to start without it. `.env` is not committed.

### Commands

| Command               | What it does                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm qa:up`          | Builds the images and starts the QA stack in the background (`up -d --build`). Run it again after code changes.                    |
| `pnpm qa:ps`          | Shows the QA containers and their health; "healthy" is good.                                                                       |
| `pnpm qa:logs`        | Follows the logs of all QA containers (Ctrl+C stops following, not the stack). `pnpm qa:logs api` (or `web`, `mongodb`) shows one. |
| `pnpm qa:seed`        | Loads the demo data (4 users, 14 pets, 11 of them with photos, 13 applications) through the QA API. Safe to run again.             |
| `pnpm qa:reset`       | Dry run: shows what a reset would delete. Changes nothing.                                                                         |
| `pnpm qa:reset --yes` | Deletes all QA data: every document in `pet-adoption-qa` and every photo in the QA volume.                                         |
| `pnpm qa:down`        | Stops the stack and removes its containers. **Data and volumes are kept.**                                                         |

All of them run `docker compose -f docker-compose.qa.yml -p pet-adoption-qa`; the README's other `docker compose` commands are for the development MongoDB. `qa:up`, `qa:ps`, `qa:logs` and `qa:down` accept only the service names `mongodb`, `api` and `web` as extra arguments, so options like `-v` are refused.

### A typical QA run

```sh
pnpm qa:up        # build and start (first build: a few minutes)
pnpm qa:ps        # wait until all three are "healthy"
pnpm qa:seed      # demo data; accounts below
# test in the browser at http://127.0.0.1:4203
pnpm qa:reset     # see what a reset would delete
pnpm qa:reset --yes && pnpm qa:seed   # start the next run from fresh demo data
pnpm qa:down      # stop; data stays for next time
```

Accounts: see [Demo data](#demo-data).

### What persists, and what a reset deletes

- **Stopping keeps everything.** `pnpm qa:down`, restarting Docker Desktop and `pnpm qa:up` (also after rebuilding) all keep the QA data, which lives in the QA volumes.
- **`pnpm qa:reset --yes`** empties the QA database (collections and indexes stay) and deletes the QA photos. It **doesn't delete volumes or containers**, and touches nothing outside the QA stack.
- **Before deleting anything, it checks** that both QA containers are running, belong to the `pet-adoption-qa` project, have the QA volumes mounted, and that the API is configured for the QA database. Inside MongoDB it confirms the database name once more. If anything doesn't match, it changes nothing.

### Warnings

> **Never run `docker compose down -v` on the main project casually.** Without `-f docker-compose.qa.yml` it targets the main project, and `-v` deletes `pet-adoption-system_mongodb_data`. That volume holds the development database. To empty QA data, always use `pnpm qa:reset`.

> **Never point the QA scripts at the development database.**
>
> - `pnpm qa:seed` always targets `http://127.0.0.1:3336/api`, and refuses to run if `DEMO_API_URL` says otherwise.
> - Don't edit the connection string in `docker-compose.qa.yml`. It must stay `mongodb://mongodb:27017/pet-adoption-qa`; `pnpm qa:reset` refuses anything else.

### Troubleshooting

| Problem                                                                | What to do                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required variable QA_SESSION_SECRET is missing a value`               | Add `QA_SESSION_SECRET` to the root `.env` (see Setup).                                                                                                                                   |
| `port is already allocated` for 4203, 3336 or 27019                    | Something else uses the port. Find it with `netstat -ano \| findstr ":4203 :3336 :27019"` (Windows) or `lsof -i :4203` (macOS/Linux). The QA ports are fixed in `docker-compose.qa.yml`.  |
| A container stays "starting" or "unhealthy" in `pnpm qa:ps`            | Check `pnpm qa:logs api` (or `mongodb`). On the first start MongoDB initialises its replica set, which takes a few seconds. The API waits for MongoDB, and the web app waits for the API. |
| Signing in seems to work but you're signed out again, or requests fail | Open **http://127.0.0.1:4203**, not `localhost:4203`. If it still happens, clear the cookies for `127.0.0.1`, or use a private window.                                                    |
| "The server could not be reached" in the web app                       | The QA API isn't healthy yet, or isn't running: `pnpm qa:ps`.                                                                                                                             |
| `pnpm qa:seed` reports differences from the intended state             | QA data was changed by hand. Run `pnpm qa:reset --yes`, then `pnpm qa:seed`.                                                                                                              |
| `pnpm qa:reset` refuses                                                | It names the container or setting that doesn't match. Usually the stack isn't running (`pnpm qa:up`). Don't work around it.                                                               |

## Tests

```sh
pnpm nx run-many -t lint typecheck test   # unit/integration tests (API uses an in-memory MongoDB)
pnpm nx e2e @pet-adoption/web-e2e         # Playwright end-to-end tests (starts its own servers)
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, typecheck, unit/integration tests and builds on every push and pull request to `master` and `develop`. The E2E tests are not part of CI yet.

## Known limitations

- Not deployed; there is no live demo. Production needs depend on the hosting setup: see [docs/deployment.md](docs/deployment.md).
- No admin role, email verification, password reset or account deletion.
- No messaging between owners and applicants; they contact each other outside the app.
- Uploaded photos keep their original metadata (e.g. camera location).
- Rate limits are kept in memory, which suits a single API instance only.

More detail: [docs/requirements.md](docs/requirements.md#known-limitations). Status and roadmap: [docs/progress.md](docs/progress.md).
