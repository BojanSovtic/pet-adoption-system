# Pet Adoption System

Learning/portfolio project: users browse and post pets for adoption and (later) submit adoption applications. The owner is experienced with Vue + TypeScript and is learning React, Express and MongoDB here.

**Before continuing development, read [docs/progress.md](docs/progress.md)** for current status, known bugs, the roadmap and the next task. Update it when a task is completed.

## Architecture

Nx 23 + pnpm monorepo, package scope `@pet-adoption`. Third-party dependencies are declared in the root `package.json`; app `package.json` files declare workspace dependencies.

- `apps/api` (`@pet-adoption/api`): Express 4 + Mongoose 9, bundled with esbuild (shared lib is bundled inline). Layering: `*.routes.ts` → `validateBody(zodSchema)` → `asyncHandler` → `*.controller.ts` → `*.service.ts` → `*.model.ts`. All errors flow to `middleware/error-handler.ts`: throw/forward `AppError` subclasses (`errors/app-error.ts`, incl. `ValidationError`); the handler responds `ApiErrorResponse` and logs only unexpected 500s. Env is validated at startup in `config/env.ts` (reads `apps/api/.env`). `app.ts` is separate from `main.ts` so supertest can use `app` directly.
- `apps/web` (`@pet-adoption/web`): React 19, React Router 6 (`createBrowserRouter`), TanStack Query, Tailwind 4 + shadcn/ui (`components/ui`), react-i18next (`en`, `sr`; namespaces `common`, `pets`), sonner toasts, zod for form validation. Feature folders: `src/features/<feature>/{api,components,pages,utils}`. `@/*` aliases `src/*`. Error handling responsibilities:
  - `src/lib/api-client.ts` (transport): every failure becomes `ApiError { status, code, details }` (network → `NETWORK_ERROR`, status 0). No UI, retries or translation here.
  - `src/app/query-client.ts` (policy): retry only network/5xx; global toast for mutation errors and background refetch errors, opt out with `meta: { skipGlobalErrorToast: true }` (typed via `Register`).
  - `src/lib/get-error-message.ts`: `getErrorMessage` (code → `common:errors.*`) and `getFieldErrors` (validation `details` → `common:validation.*`).
  - Features: inline error/not-found states and mapping field errors to inputs.
- `packages/shared/models` (`@pet-adoption/models`): types and constants shared by API and web (`Pet`, `CreatePetInput`, `PET_SPECIES`, length limits, `ApiErrorResponse`). Plain TypeScript, no runtime dependencies; zod schemas stay in each app (`satisfies z.ZodType<...>` keeps API schemas in sync). Linked via pnpm workspaces (`workspace:*` in each app's `package.json`).
- MongoDB: `docker-compose.yml` (mongo:8, port 27017). API tests use a real test DB (`MONGODB_TEST_URI`) that is dropped after each test (`apps/api/src/test/setup.ts`).

`README.md` is the unmodified Nx template and does not describe this project.

## Commands

Run tasks through Nx with pnpm:

```sh
pnpm nx run-many -t lint typecheck test   # full check
pnpm nx test @pet-adoption/api            # requires MongoDB running
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
- Do not introduce a centralized API client/interceptor until frontend usage justifies it; raise it when it does.
- Work in small, coherent steps; explain important decisions and trade-offs briefly (relate to Vue when useful), without lengthy tutorials.
- Inspect only the files relevant to the task; do not repeat investigations already recorded in `docs/progress.md`.
- Run relevant lint/typecheck/tests after changes and fix regressions you introduce.
- Never make unrelated refactors, and never overwrite or discard existing changes without asking first.
- Treat authentication, authorization, input validation and database access as security-sensitive. Never trust client-supplied user IDs or ownership claims; enforce permissions on the server and test unauthorized access.

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
- Read `docs/progress.md` before starting and update it after meaningful milestones.
- Reuse existing architecture, utilities, types and patterns instead of creating duplicates.
- Avoid unnecessary refactoring, speculative improvements and new dependencies.
- Explain important decisions and unfamiliar concepts briefly, especially React, Express, TypeScript and backend architecture.
- Don't repeat explanations or summarize every file inspected.
- Run the most relevant tests and checks rather than rerunning every check after every small edit. Run the full suite at meaningful milestones.
- Report changed files, checks performed, their results and any remaining concerns concisely.
- If blocked, explain the specific issue and ask for the missing information instead of repeatedly investigating.
- Never skip necessary validation, security checks or tests just to reduce usage.
- Never claim a test passed unless it was actually run and passed.
