# Pet Adoption System

Learning/portfolio project: users browse and post pets for adoption, apply to adopt pets posted by others, and owners review the applications. The owner is experienced with Vue + TypeScript and is learning React, Express and MongoDB here.

**Before continuing development, read [docs/progress.md](docs/progress.md)** for current status, known bugs, the roadmap and the next task. Update it when a task is completed.

Read the other docs only when the task needs them:

- [docs/requirements.md](docs/requirements.md): user roles, workflows and business rules. Consult it when working on business logic, user-facing behavior, authorization, or tests of those. Update it when behavior changes.
- [docs/architecture.md](docs/architecture.md): Mermaid diagrams of the current architecture (system, request pipeline, auth, data model, adoption workflow, Docker, E2E). Consult it when architectural context is relevant; update the affected diagram when the structure changes.
- [docs/deployment.md](docs/deployment.md): requirements for a future deployment (cookies, HTTPS, proxy, env vars). Consult it only for deployment or production-config work.

## Testing policy (risk-based)

Before running anything expensive, look at what changed and pick the checks that cover its risk. Say which checks you ran, which you skipped and why, and report actual results; never claim a check passed that wasn't run.

| Change | Run |
|---|---|
| Documentation only (no code or executable config) | Nothing |
| Localized code change | The affected project's relevant specs, plus `lint` / `typecheck` (`build` if build config changed) |
| API, auth/session, authorization, database, or a change spanning API + web + shared lib | The affected projects' full `test` suites plus `lint typecheck`, and E2E if the next row applies |
| Critical user journeys, auth/session, frontend-to-backend integration, routing, application workflows, or shared infrastructure (Docker, Nx, env, CI) | Also `pnpm nx e2e @pet-adoption/web-e2e` |
| Finishing a significant batch, before a release, or at a v1 integration checkpoint | `pnpm nx run-many -t lint typecheck test build` and E2E |

- Don't rerun the full E2E suite for routine, unrelated changes. When skipping it, say why in one line.
- Rerun a check only after a failure or a further code change.
- Risk-based means choosing the right tests, not avoiding them: never skip a check a change actually needs.

## Architecture

Nx 23 + pnpm monorepo, package scope `@pet-adoption`. Third-party dependencies are declared in the root `package.json`; app `package.json` files declare workspace dependencies. Exception: the API's runtime dependencies (everything its bundle `require`s) are also listed in `apps/api/package.json`, with the same version ranges as the root, because the Nx `prune` target (used by the Docker image) builds the production install from it. Add new API runtime packages in both places.

- `apps/api` (`@pet-adoption/api`): Express 4 + Mongoose 9, bundled with esbuild (shared lib is bundled inline). Layering: `*.routes.ts` → `validateBody(zodSchema)` → `asyncHandler` → `*.controller.ts` → `*.service.ts` → `*.model.ts`. All errors flow to `middleware/error-handler.ts`: throw/forward `AppError` subclasses (`errors/app-error.ts`, incl. `ValidationError`); the handler responds `ApiErrorResponse` and logs only unexpected 500s. Env is validated at startup in `config/env.ts` (reads `apps/api/.env`). `app.ts` is separate from `main.ts` so supertest can use `app` directly.
- `apps/web` (`@pet-adoption/web`): React 19, React Router 6 (`createBrowserRouter`), TanStack Query, Tailwind 4 + shadcn/ui (`components/ui`), react-i18next (`en`, `sr`; namespaces `common`, `pets`, `auth`, `applications`; the header selector saves the language in `localStorage`, read in `i18n/config.ts`; store translation keys in state and translate on render so a language change applies), sonner toasts, zod for form validation. Feature folders: `src/features/<feature>/{api,components,pages,utils}`. `@/*` aliases `src/*`. Error handling responsibilities:
  - `src/lib/api-client.ts` (transport): the Axios instance `http` (`baseURL` = `VITE_API_URL`, `withCredentials: true`). Its response interceptor turns every failure into `ApiError { status, code, details }` (no response → `NETWORK_ERROR`, status 0; cancellations pass through). API functions call `http.get/post/...` and return `data`. No UI, retries or translation here. Tests replace the transport with `http.defaults.adapter` (`lib/testing/mock-http-adapter.ts`).
  - `src/app/query-client.ts` (policy): retry only network/5xx; global toast for mutation errors and background refetch errors, opt out with `meta: { skipGlobalErrorToast: true }` (typed via `Register`).
  - `src/lib/get-error-message.ts`: `getErrorMessage` (code → `common:errors.*`) and `getFieldErrors` (validation `details` → `common:validation.*`).
  - Features: inline error/not-found states and mapping field errors to inputs.
- `packages/shared/models` (`@pet-adoption/models`): types and constants shared by API and web (`Pet`, `CreatePetInput`, `PET_SPECIES`, length limits, `ApiErrorResponse`). Plain TypeScript, no runtime dependencies; zod schemas stay in each app (`satisfies z.ZodType<...>` keeps API schemas in sync). Linked via pnpm workspaces (`workspace:*` in each app's `package.json`).
- Authentication (API): server-side sessions (`express-session` + `connect-mongo`, `sessions` collection, reusing Mongoose's client), HttpOnly `sid` cookie (`SameSite=Lax`, `Secure` in production), Argon2id passwords (`argon2`). Layers kept separate so other sign-in methods (OAuth/OIDC) can be added later:
  - `users/` = identity (`UserModel`, `toPublicUser`; `passwordHash` is `select: false` and optional).
  - `auth/auth.service.ts` = the password method; `auth/session.ts` = `startUserSession(req, userId)` (regenerates the id) / `endUserSession` — independent of the sign-in method.
  - CSRF: `SameSite=Lax` + `middleware/require-trusted-origin.ts` (unsafe methods with a foreign `Origin` → 403 `UNTRUSTED_ORIGIN`). CORS uses `credentials: true`; the web `http` client sends cookies (`withCredentials: true`).
  - Rate limiting (`middleware/rate-limit.ts`): per-IP limit on `/login` + `/register`, per-IP+email limit on failed logins → 429 `RATE_LIMITED`. Tests reset counters in `test/setup.ts`; tests that hash many passwords need a longer timeout.
  - Authorization: `auth/require-auth.ts` (`requireAuth` → 401, before validation; `getAuthenticatedUserId(req)` in handlers). Ownership lives in services as owner-scoped queries (`{ _id, owner }`); non-owner → 403 `NOT_PET_OWNER`. Owner ids always come from the session, never the body. API tests sign in with `createSignedInAgent()` (`test/auth-test-helpers.ts`).
- Authentication (web): current user = TanStack query `['auth', 'me']` (`useCurrentUser`; `getCurrentUser` maps 401 to `null`). Login/register/logout set that cache entry; `query-client.ts` sets it to `null` on any `UNAUTHENTICATED` error. Pages that need sign-in redirect to `/login` with `state.from`; ownership UI uses `isPetOwner` (display only, the API decides).
- File uploads: files go through the `FileStorage` interface (`apps/api/src/storage/`; local disk now, object storage later); MongoDB stores only keys (`Pet.images[].key`, at most `PET_IMAGE_MAX_COUNT` = 5, enforced inside the update query); the API returns `images: [{ _id, url }]` plus `imageUrl` (the first photo, for cards and older clients). Old single `imageKey` records are converted at startup (`backfillPetImages`). Validate uploads by content (magic bytes), not filename/MIME; check auth and ownership before parsing the body; write the new file before the DB update and delete replaced files after it (`deleteStoredFileQuietly`). API tests use a temporary uploads dir (`listStoredFiles` in `test/upload-test-helpers.ts`).
- Query keys: use factories (`petQueryKeys`, `applicationQueryKeys`) and put every request parameter in the key. List endpoints (pets, `/applications/mine`, `/applications/received`) are paginated (`Paginated<T>`, shared `components/pagination.tsx`); query strings are validated with zod via `parseInput` (`middleware/validate.ts`). The pet list keeps its state in the URL (`useSearchParams`).
- Adoption applications (`apps/api/src/applications/`): state machines for applications and pets live in the shared lib (`adoption-application.model.ts`). Status changes only via explicit actions (`/applications/:id/accept|reject|withdraw`), never by setting a status. Every application or pet-status write runs in `withTransaction` (`config/database.ts`) and starts with `lockPet` (the first write serializes concurrent transactions on that pet); pet status changes go through `transitionPetStatus`. Unique partial indexes back the rules. Applications store `petOwner` (copy of `pet.owner`, set on submit) so owner queries never load the owner's pet ids; owner-side queries filter by `petOwner`. Web: per-user caches are cleared via `setCurrentUser` on every identity change.
- MongoDB must be a **replica set** (transactions); the API refuses to start otherwise. Dev: `docker-compose.yml` (single-node `rs0`, host port 27018, `?directConnection=true`). API tests start an in-memory replica set (`mongodb-memory-server`, `test/global-setup.ts`; first run downloads the MongoDB binary) — no local MongoDB needed. Test DB is dropped/re-indexed once per file, documents cleared after each test, spec files run sequentially (`fileParallelism: false`).
- Docker: `docker compose up -d` starts only MongoDB; `docker compose --profile app up -d --build` also runs the API (`apps/api/Dockerfile`: Nx `prune` → bundle + production deps, non-root) and web (`apps/web/Dockerfile`: Vite build served by nginx; `VITE_API_URL` is a build arg and must be browser-reachable). Root `.env` (from `.env.example`) holds `SESSION_SECRET` for Compose. Manual QA runs on the separate `docker-compose.qa.yml` stack (own MongoDB server, database `pet-adoption-qa`, volumes; 127.0.0.1:4203/3336) via `pnpm qa:*` only; its names are checked by `apps/api/src/scripts/qa-config.ts`, so change both together. Never run `docker compose down -v` on the main project (it holds the dev and demo databases).

`README.md` describes setup (Docker and local development).

## Commands

Run tasks through Nx with pnpm:

```sh
pnpm nx run-many -t lint typecheck test   # full check (CI also runs build: .github/workflows/ci.yml)
pnpm nx test @pet-adoption/api            # uses an in-memory replica set
pnpm nx test @pet-adoption/api -- src/pets/pet.controller.spec.ts   # one spec (run from the repo root)
pnpm nx e2e @pet-adoption/web-e2e         # Playwright; starts its own API (:3334, in-memory DB) and web (:4201)
pnpm nx serve @pet-adoption/api           # http://localhost:3333/api
pnpm nx dev @pet-adoption/web             # http://localhost:4200
```

Environment note observed on the owner's machine: the Nx daemon may hang (use `NX_DAEMON=false`). If Nx reports the workspace is out of sync, run `pnpm nx sync` and commit the resulting tsconfig changes.

## Conventions

- Strict TypeScript; Prettier with single quotes; ESLint flat config.
- `const` arrow functions for functions and components; components exported as named exports (`export { PetCard };`).
- File names in kebab-case (`pet-card.tsx`, `pet.controller.ts`). Tests sit next to code as `*.spec.ts`.
- API error responses are `{ code, details? }` with stable codes (e.g. `PET_NOT_FOUND`, `VALIDATION_FAILED`); the API sends no display text, the web translates codes. New codes need `common:errors.*` translations in `en` and `sr`.
- Run Prettier only on files you changed (repo-wide runs rewrite line endings of untouched files).
- User-facing text goes through i18n, in both `en` and `sr`.

## Working agreements

- Prefer simple, maintainable solutions. Explain why before adding any dependency.
- Do not reintroduce removed Nx-generated placeholder apps/libs. Do not restructure the monorepo without a concrete reason.
- Work in small, coherent steps; explain important decisions and trade-offs briefly (relate to Vue when useful), without lengthy tutorials.
- Inspect only the files relevant to the task; do not repeat investigations already recorded in `docs/progress.md`.
- Run the checks the testing policy above calls for, and fix regressions you introduce.
- Never make unrelated refactors, and never overwrite or discard existing changes without asking first.
- Treat authentication, authorization, input validation and database access as security-sensitive. Never trust client-supplied user IDs or ownership claims; enforce permissions on the server and test unauthorized access.

## Architecture documentation

- Keep `docs/architecture.md` concise and focused on major system flows and relationships.
- Update only the diagram or section affected by a meaningful architectural change.
- Prefer small, targeted edits over regenerating the entire document.
- Do not update diagrams for routine bug fixes, styling changes, or internal refactors that do not change the architecture.
- Verify diagrams against the actual code and distinguish implemented features from planned ones.
- Avoid rereading the entire repository solely to make a minor documentation update when the relevant code is already known.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

## Efficient AI-assisted development

- Keep responses concise and focused on the current task.
- Inspect only the files relevant to the task. Avoid rereading the entire repository unless necessary.
- Read `docs/progress.md` before starting and update it after meaningful milestones. Read `docs/requirements.md` and `docs/architecture.md` only when relevant (see the top of this file).
- Reuse existing architecture, utilities, types and patterns instead of creating duplicates.
- Avoid unnecessary refactoring, speculative improvements and new dependencies.
- Explain important decisions and unfamiliar concepts briefly, especially React, Express, TypeScript and backend architecture.
- Don't repeat explanations or summarize every file inspected.
- Report changed files, checks performed, their results and any remaining concerns concisely.
- If blocked, explain the specific issue and ask for the missing information instead of repeatedly investigating.
- Never skip necessary validation, security checks or tests just to reduce usage.
