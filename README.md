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
  1. Run the app (see "Option A: everything in Docker" below), register two users and add a few pets.
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

There are two ways to run it locally (for manual QA there is a third, isolated stack: see [Docker QA environment](#docker-qa-environment)):

|                      | Option A: everything in Docker | Option B: local development              |
| -------------------- | ------------------------------ | ---------------------------------------- |
| Best for             | Trying the app                 | Changing the code (hot reload)           |
| Runs in Docker       | MongoDB, API, web app          | MongoDB only                             |
| Runs on your machine | Nothing                        | API and web app (Node.js)                |
| Needs                | Docker Desktop, Git            | Docker Desktop, Git, Node.js 22, pnpm 12 |

Both use the same ports (web 4200, API 3333) and the **same MongoDB database**, so run one option at a time. Uploaded photos are _not_ shared: Docker keeps them in a volume, local development in `apps/api/uploads/`, so a photo added in one option shows as missing in the other.

### Option A: everything in Docker

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (started, with the whale icon showing "running") and Git. You don't need Node.js or pnpm: the images install everything themselves.

All commands run in a terminal opened in the **repository root**, the `pet-adoption-system` folder that contains `docker-compose.yml`.

**1. One-time setup:** create `.env` in the repository root from the example:

```sh
cp .env.example .env
```

Open `.env` and set `SESSION_SECRET` to at least 32 random characters. The API refuses to start without it. Any long random string works, for example from a password generator, or, if Node.js is installed:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**2. Build and start:**

```sh
docker compose --profile app up -d --build
```

The first build takes a few minutes. Compose starts MongoDB, waits until it is healthy, then starts the API, waits for it, then starts the web app. `-d` returns you to the prompt while the containers keep running.

**3. Open the app:**

| What                                         | Address                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| Web app                                      | http://localhost:4200                                          |
| API health check (returns `{"status":"ok"}`) | http://localhost:3333/api/health                               |
| API: public pet list (JSON)                  | http://localhost:3333/api/pets                                 |
| MongoDB, for tools such as MongoDB Compass   | `mongodb://localhost:27018/pet-adoption?directConnection=true` |

The database starts empty. Register a user in the web app and add pets. To try the adoption flow, register a second user (for example in a private browser window) and apply for the first user's pet. For ready-made data, see [Demo data](#demo-data-optional).

**Check status and logs:**

```sh
docker compose --profile app ps              # each container's state: "healthy" is good
docker compose --profile app logs -f api     # follow the API's log (Ctrl+C stops following, not the app)
docker compose --profile app logs mongodb    # MongoDB's log
```

The API logs `[ ready ] http://0.0.0.0:3333` when it has started. If it fails, the log ends with the reason: an `Error: …` line for missing settings (for example `SESSION_SECRET is required`), or a line starting with `[ startup ]` for problems such as the database.

**Stop and start again:**

```sh
docker compose --profile app stop              # stop the containers; start again with "start"
docker compose --profile app start
docker compose --profile app down              # stop and remove the containers (data is kept)
docker compose --profile app up -d             # start again after "down"
docker compose --profile app up -d --build     # after changing code: rebuild and restart
```

The containers restart automatically when Docker Desktop starts, unless you stopped them.

#### Your data

- The database is stored in the Docker volume `pet-adoption-system_mongodb_data` and uploaded photos in `pet-adoption-system_uploads_data`. Stopping, `down`, restarting and rebuilding all **keep** them.
- These **delete** them, so avoid them unless you want to start from scratch:
  - `docker compose --profile app down -v` (the `-v` removes the volumes)
  - `docker volume rm …` or `docker volume prune`, `docker system prune --volumes`
  - Deleting the volumes in Docker Desktop's _Volumes_ tab, or _Troubleshoot → Clean / Purge data_
- To back up the database first (photos are not included):

  ```sh
  docker exec pet-adoption-mongodb mongodump --db pet-adoption --archive=/tmp/pet-adoption.archive
  docker cp pet-adoption-mongodb:/tmp/pet-adoption.archive ./pet-adoption.archive
  ```

  To restore it later, copy it back in and run `mongorestore`:

  ```sh
  docker cp ./pet-adoption.archive pet-adoption-mongodb:/tmp/pet-adoption.archive
  docker exec pet-adoption-mongodb mongorestore --archive=/tmp/pet-adoption.archive
  ```

#### Troubleshooting

| Problem                                                                               | What to do                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot connect to the Docker daemon`, `error during connect`, or similar             | Docker Desktop isn't running. Start it and wait until it says it's running.                                                                                                                                                                                                                                                                                                                                       |
| `api` keeps restarting, `web` never starts, the log says `SESSION_SECRET is required` | The root `.env` is missing or `SESSION_SECRET` is shorter than 32 characters. Fix it, then run `docker compose --profile app up -d`.                                                                                                                                                                                                                                                                              |
| `port is already allocated` / `address already in use`                                | Something else uses port 4200, 3333 or 27018, often the local dev servers from option B. Stop them (Ctrl+C), or find the program with `netstat -ano \| findstr :3333` (Windows) / `lsof -i :3333` (macOS/Linux). For 4200 and 3333 you can instead set `WEB_PORT` / `API_PORT` in `.env` and run `up -d --build` (the web app's API address is fixed at build time). Port 27018 is fixed in `docker-compose.yml`. |
| The page loads but shows "The server could not be reached"                            | The API isn't running or not healthy yet. Check `docker compose --profile app ps` and the API log.                                                                                                                                                                                                                                                                                                                |
| The API log mentions MongoDB or a replica set                                         | MongoDB isn't ready. Check `docker compose --profile app logs mongodb` and that `mongodb` is "healthy" in `ps`. The first start initializes the replica set and can take a few seconds longer.                                                                                                                                                                                                                    |
| The app can't reach the API after changing `WEB_PORT` / `API_PORT`                    | Run `docker compose --profile app up -d --build` so the web app and the API's allowed origin both use the new ports.                                                                                                                                                                                                                                                                                              |

### Option B: local development (MongoDB in Docker, apps with Node.js)

**Prerequisites:** Docker Desktop, Git, Node.js 22 and pnpm 12. Run the commands in the repository root.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env   # then set SESSION_SECRET in it (32+ characters)
cp apps/web/.env.example apps/web/.env
docker compose up -d                     # MongoDB only (replica set on port 27018)
pnpm nx serve @pet-adoption/api          # API: http://localhost:3333/api
pnpm nx dev @pet-adoption/web            # web app: http://localhost:4200 (in a second terminal)
```

- Option B uses `apps/api/.env` and `apps/web/.env`; the root `.env` is only for option A.
- **The development database (`pet-adoption`) starts empty.** To fill it with the demo users, pets and applications, run this once while the dev API is running (safe to run again; it only adds what is missing):

  ```sh
  pnpm dev:seed   # seeds through http://localhost:3333/api into the database in apps/api/.env
  ```

  It refuses to run if the API on port 3333 is an older build, for example the Docker app stack (option A).

- Stop the dev servers with Ctrl+C. `docker compose stop` stops MongoDB and keeps its data; `docker compose up -d` starts it again.
- **Options A and B use the same ports (3333, 4200) and the same database**, so only one can run at a time. Before switching to option B, stop the app containers with `docker compose --profile app stop` (MongoDB keeps running). Otherwise the dev API stops with "Port 3333 … is already in use", and the web dev server refuses to start on a taken port 4200.
- Photos are stored per stack: the dev API in `apps/api/uploads`, Docker in the `uploads_data` volume. Pets seeded through one stack show missing photos in the other.

### Demo data (optional)

A ready-made demo with 4 users, 14 pets and 13 adoption applications in every status. It covers both list pages, all statuses, an auto-rejected application and a withdrawn one. It runs on its own database (`pet-adoption-demo`), photo folder (`tmp/demo-uploads`) and ports (web 4202, API 3335), so it never touches your development data.

**Prerequisites:** those of option B, including `apps/api/.env` with `SESSION_SECRET`, and MongoDB running (`docker compose up -d`).

```sh
pnpm demo:start   # terminal 1: web app http://localhost:4202, API http://localhost:3335/api (Ctrl+C stops both)
pnpm demo:seed    # terminal 2: creates the demo data; safe to run again
```

Sign in at http://localhost:4202 as `ana@demo.example.com` (owner with the most pets and applications), `marko@demo.example.com`, `jelena@demo.example.com` or `luka@demo.example.com`. All four use the demo-only password `demo-password`.

- **Rerunning** `pnpm demo:seed` only adds what is missing. If demo data was changed by hand (decisions are final), it reports the difference instead of guessing.
- **Starting over:** `pnpm demo:reset` shows what it would delete. `pnpm demo:reset --yes` empties the demo database and deletes the demo photos. It refuses any database whose name doesn't end in `-demo`.
- **Photos:** up to 5 per pet from [apps/api/src/scripts/demo-images/](apps/api/src/scripts/demo-images/README.md) (`max.jpg`, `max-2.jpg`, …). `pnpm demo:images` copies downloaded images to those names as listed in `mapping.json`. The seed adds photos only to pets that have none yet.
- **Seeding a fresh Docker stack** (option A, e.g. for someone reviewing the project) works through its API. Run this only when that stack has no data of your own:

  ```sh
  DEMO_API_URL=http://localhost:3333/api pnpm demo:seed --allow-port-3333
  ```

  In PowerShell, set the variable first: `$env:DEMO_API_URL = 'http://localhost:3333/api'`.

- **Rate limit:** sign-in and registration allow 20 attempts per 15 minutes. A first seed uses 8 and a rerun 4. If the seed reports the limit, wait or restart `pnpm demo:start`.

## Docker QA environment

A separate Docker stack for manual QA. It runs the built web app (nginx) and API like option A, but with **its own MongoDB server, database, network and photo storage**, so testing never touches your development data or the demo.

|                                    | Docker QA                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| Web app (open this)                | **http://127.0.0.1:4203**                                                                        |
| API health check                   | http://127.0.0.1:3336/api/health                                                                 |
| MongoDB, for tools such as Compass | `mongodb://127.0.0.1:27019/pet-adoption-qa?directConnection=true`                                |
| Compose file / project             | `docker-compose.qa.yml` / `pet-adoption-qa`                                                      |
| Containers                         | `pet-adoption-qa-mongodb`, `pet-adoption-qa-api`, `pet-adoption-qa-web`                          |
| Database                           | `pet-adoption-qa` on its own MongoDB server                                                      |
| Volumes                            | `pet-adoption-qa_mongodb_data`, `pet-adoption-qa_mongodb_config`, `pet-adoption-qa_uploads_data` |

Use `127.0.0.1`, **not** `localhost`. The API only accepts the web app from `http://127.0.0.1:4203`. Browsers also keep cookies per host name, not per port, so this keeps your QA sign-in separate from development and the demo on `localhost`.

### Setup (once)

**Prerequisites:** Docker Desktop (running), Node.js 22, pnpm 12, and `pnpm install` (the `qa:*` commands are pnpm scripts).

Add `QA_SESSION_SECRET` to the root `.env` (see `.env.example`). Use at least 32 random characters, different from `SESSION_SECRET`:

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

All of them run `docker compose -f docker-compose.qa.yml -p pet-adoption-qa`; the README's other `docker compose` commands are for the main project. `qa:up`, `qa:ps`, `qa:logs` and `qa:down` accept only the service names `mongodb`, `api` and `web` as extra arguments, so options like `-v` are refused.

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

The seeded accounts are `ana@demo.example.com` (owner of most pets), `marko@demo.example.com`, `jelena@demo.example.com` and `luka@demo.example.com`. All use the demo-only password `demo-password`.

### What persists, and what a reset deletes

- **Stopping keeps everything.** `pnpm qa:down`, restarting Docker Desktop and `pnpm qa:up` (also after rebuilding) all keep the QA data, which lives in the QA volumes.
- **`pnpm qa:reset --yes`** empties the QA database (collections and indexes stay) and deletes the QA photos. It **doesn't delete volumes or containers**, and touches nothing outside the QA stack.
- **Before deleting anything, it checks** that both QA containers are running, belong to the `pet-adoption-qa` project, have the QA volumes mounted, and that the API is configured for the QA database. Inside MongoDB it confirms the database name once more. If anything doesn't match, it changes nothing.

### How it differs from the other environments

|           | Docker QA                             | Local development (option B) | Demo (`pnpm demo:start`)                 | Docker app (option A)                     | E2E (`pnpm nx e2e`)     |
| --------- | ------------------------------------- | ---------------------------- | ---------------------------------------- | ----------------------------------------- | ----------------------- |
| Runs      | Built images (nginx + API bundle)     | Dev servers from source      | Dev servers from source                  | Built images                              | Dev servers from source |
| Web / API | 127.0.0.1:4203 / 3336                 | localhost:4200 / 3333        | localhost:4202 / 3335                    | localhost:4200 / 3333                     | localhost:4201 / 3334   |
| Database  | `pet-adoption-qa`, own MongoDB server | `pet-adoption`               | `pet-adoption-demo` (same server as dev) | `pet-adoption` (same as dev)              | In memory, thrown away  |
| Photos    | Volume `pet-adoption-qa_uploads_data` | `apps/api/uploads/`          | `tmp/demo-uploads/`                      | Volume `pet-adoption-system_uploads_data` | Temporary folder        |
| Use for   | Manual QA                             | Development                  | Demos                                    | Trying the app                            | Automated tests         |

All of them can run at the same time; they use different ports. Option A and local development can't run together, because they share 4200/3333.

### Warnings

> **Never run `docker compose down -v` on the main project casually.** Without `-f docker-compose.qa.yml` it targets the main project, and `-v` deletes `pet-adoption-system_mongodb_data`. That volume holds the development **and** the demo database. To empty QA data, always use `pnpm qa:reset`.

> **Never point the QA scripts at the development or demo database.**
>
> - `pnpm qa:seed` always targets `http://127.0.0.1:3336/api`, and refuses to run if `DEMO_API_URL` says otherwise.
> - `pnpm demo:seed` refuses the QA port.
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
