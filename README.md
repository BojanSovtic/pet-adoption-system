# Pet Adoption System

Users browse pets, post their own pets for adoption, and apply to adopt pets posted by others; owners review and accept applications.

Nx + pnpm monorepo: `apps/web` (React + Vite), `apps/api` (Express + MongoDB), `packages/shared/models` (shared types). Architecture diagrams: [docs/architecture.md](docs/architecture.md).

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

   | Service | URL |
   |---|---|
   | Web app | http://localhost:4200 |
   | API health | http://localhost:3333/api/health |
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

Project status and roadmap: [docs/progress.md](docs/progress.md).
