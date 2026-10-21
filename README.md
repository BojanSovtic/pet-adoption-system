# Pet Adoption System

[![CI](https://github.com/BojanSovtic/pet-adoption-system/actions/workflows/ci.yml/badge.svg)](https://github.com/BojanSovtic/pet-adoption-system/actions/workflows/ci.yml)

A full-stack web app where people post pets that need a new home, others apply to adopt them, and the person who posted the pet reviews the applications and accepts one.

- **Visitors** browse, search and filter pets without an account.
- **Signed-in users** post pets (with a photo), apply to adopt other people's pets, and withdraw their applications.
- **Pet owners** see who applied, with their contact details, and accept or reject applications. Accepting one adopts the pet and rejects the others.

The interface is available in English and Serbian. The full rules are in [docs/requirements.md](docs/requirements.md).

## Screenshots

<!--
  Screenshots are not captured yet. To add them:
  1. Run the app (see "Run with Docker" below), register two users and add a few pets.
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

## Run with Docker (recommended)

**Prerequisites:** Docker Desktop (or Docker Engine with Compose v2).

1. Create `.env` in the repository root (skip this if you already have one):

   ```sh
   cp .env.example .env
   ```

   Set `SESSION_SECRET` to at least 32 random characters, e.g. the output of
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

2. Build and start everything:

   ```sh
   docker compose --profile app up -d --build
   ```

   The first build takes a few minutes. Compose starts MongoDB, waits until it is ready, then the API, then the web app.

3. Open:

   | Service                             | URL                                                            |
   | ----------------------------------- | -------------------------------------------------------------- |
   | Web app                             | http://localhost:4200                                          |
   | API health                          | http://localhost:3333/api/health                               |
   | MongoDB (for tools such as Compass) | `mongodb://localhost:27018/pet-adoption?directConnection=true` |

   `docker compose ps` shows each service's health; `docker compose logs -f api` shows API logs.

**Data:** MongoDB data and uploaded pet photos live in named volumes (`mongodb_data`, `uploads_data`) and survive restarts and rebuilds. There is no seed data: the database starts empty, so register a user in the web app and add pets from there.

**Stop:**

```sh
docker compose --profile app down      # keeps the data
docker compose --profile app down -v   # also deletes the database and photos
```

To use other host ports, set `API_PORT` / `WEB_PORT` in `.env` and rebuild (the web app's API address is fixed at build time).

## Local development (without containers for the apps)

**Prerequisites:** Node.js 22, pnpm 12, Docker (for MongoDB only).

```sh
pnpm install
cp apps/api/.env.example apps/api/.env   # then set SESSION_SECRET
cp apps/web/.env.example apps/web/.env
docker compose up -d                     # MongoDB only (replica set on port 27018)
pnpm nx serve @pet-adoption/api          # http://localhost:3333/api
pnpm nx dev @pet-adoption/web            # http://localhost:4200
```

Stop the dev servers with Ctrl+C and MongoDB with `docker compose down`. The Docker app stack and the dev servers use the same ports (3333, 4200), so run one or the other.

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
