# Pet Adoption System

Learning/portfolio project: users browse and post pets for adoption, apply to adopt pets posted by others, and owners review the applications. The owner is experienced with Vue + TypeScript and is learning React, Express and MongoDB here.

**Current phase:** the first functional demo is deployed (2026-11-18). The project is now in a maintenance, learning and incremental-development phase. Features can be added, but understanding the code, maintainability, tests and consistent architecture come first. Avoid large feature expansions without a clear reason, and don't add features or polish the owner hasn't asked for.

**Before continuing development, read [docs/progress.md](docs/progress.md)** for the current state, known issues and next steps. Update it when a task is completed.

Read the other docs only when the task needs them:

- [docs/requirements.md](docs/requirements.md): what the app does (roles, workflows, business rules, limits). Consult it for business logic, user-facing behaviour, authorization, or tests of those.
- [docs/architecture.md](docs/architecture.md): how it works (system, request pipeline, API code organisation in §2c, auth, data model, adoption workflow, environments). Consult it when architectural context is relevant.
- [docs/deployment.md](docs/deployment.md): the live demo's managed hosting ("Live demo" section) and the self-hosted reference configuration. Consult it for deployment or production-config work.
- [docs/production-readiness.md](docs/production-readiness.md): verified security controls, open blockers before real users, open decisions.

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
- New user-visible behaviour also gets cases in `docs/manual-qa-test-cases.csv` (README "Manual testing").

## Architecture

Nx 23 + pnpm monorepo, package scope `@pet-adoption`. Structure and flows are in [docs/architecture.md](docs/architecture.md); the rules below are the ones that are easy to break.

**Dependencies.** Third-party dependencies are declared in the root `package.json`; app `package.json` files declare workspace dependencies. Exception: the API's runtime dependencies (everything its bundle `require`s) are also listed in `apps/api/package.json`, with the same version ranges, because the Nx `prune` target (used by the Docker image) builds the production install from it. Add and upgrade them in both places. CI fails on high or critical advisories in production dependencies (`pnpm audit --prod --audit-level high`).

**API** (`apps/api`: Express 4, Mongoose 9, bundled with esbuild; the shared lib is bundled inline):

- **Where code goes** (architecture.md §2c): `src/features/<area>/` with `<entity>.<role>.ts` files (routes → `validateBody(zodSchema)` → `asyncHandler(controller)` → service → model); infrastructure without business rules in `src/core/` (`config`, `errors`, `logging`, `middleware`, `storage`); command-line tools in `src/scripts/{admin,demo,qa}/`. Features stay flat (no per-layer folders), and production code in `core/` never imports a feature.
- **Errors:** throw or forward `AppError` subclasses (`core/errors/app-error.ts`); `core/middleware/error-handler.ts` responds `{ code, details? }` and logs only unexpected 500s.
- **Logging:** `logger` (`core/logging/logger.ts`), never `console`. Pass only explicit safe fields (ids, counts, `err: serializeError(error)`): never bodies, headers, query strings, emails, names or whole request/user objects.
- **Input:** bodies with `validateBody`, query strings with `parseInput` (`core/middleware/validate.ts`); API schemas `satisfies` the shared types. Env is validated at startup in `core/config/env.ts`; CLI tools (`admin:grant|revoke`, `audit:verify`) load only `core/config/env-file.ts`.
- **Sessions and authorization:** server-side sessions (`features/auth/session.ts`, new id on sign-in; independent of the sign-in method). `requireAuth` (`features/auth/require-auth.ts`) runs before validation and reads `role` and `suspendedAt` from MongoDB on every request; `requireAdmin` guards the whole `/api/admin` router. User and owner ids come only from the session, never the body; ownership is enforced by owner-scoped service queries (`{ _id, owner }`). CSRF protection is `SameSite=Lax` plus `requireTrustedOrigin`.
- **Rate limits:** all values in `core/middleware/rate-limit.ts`. Every new write route needs a per-user limiter right after `requireAuth`.
- **Adoption workflow:** statuses change only through explicit actions and the shared state machines (`adoption-application.model.ts`). Every application or pet-status write runs in `withTransaction` (`core/config/database.ts`) and starts with `lockPet`; pet status changes go through `transitionPetStatus`. Conversation queries are always scoped to the participants (others get 404).
- **Admin:** role and suspension changes only through `features/admin/user-role.service.ts`, listing moderation through `pet-moderation.service.ts`, and every admin change through `runAudited` (change and audit entry in one transaction). Applications stay read-only for admins; nothing bypasses ownership or the state machines. Only `pnpm admin:grant` creates the first admin; registration never sets a role.
- **Photos:** always through the `FileStorage` interface (`core/storage/`, `local` or `cloudinary` by `STORAGE_DRIVER`); MongoDB stores only keys. Check auth and ownership before parsing the body, validate by content (magic bytes), re-encode with `processPetImage` (`features/pets/pet-image.ts`), write the new file before the DB update and delete replaced files after it.
- **Email:** always through `emailSender` (`core/email/`, driver by `EMAIL_DRIVER`: `brevo` in production, `outbox` in development/QA/E2E, `memory` in API tests, read with `sentEmails()` from `test/email-capture.ts`). Drivers don't log; log only the receipt id, never recipients, contents or links. Tests and E2E set the driver explicitly, so a real key in `apps/api/.env` is never used there.
- **MongoDB must be a replica set** (transactions); the API refuses to start otherwise.
- **Tests:** an in-memory replica set (`src/test/global-setup.ts`; the first run downloads MongoDB); spec files run sequentially and documents are cleared after each test. Sign in with `createSignedInAgent()` (`test/auth-test-helpers.ts`), make admins with `UserModel.updateOne(... { role: 'admin' })`, capture logs with `test/log-capture.ts`, list uploaded files with `listStoredFiles` (`test/upload-test-helpers.ts`, a temporary uploads dir). Tests that hash many passwords need a longer timeout. `test/setup.ts` resets rate-limit counters and enables cheap Argon2 parameters (refused outside Vitest and in production); production parameters are pinned in `features/auth/password.ts` and used by E2E.

**Web** (`apps/web`: React 19, React Router 6 `createBrowserRouter`, TanStack Query, Tailwind 4 + shadcn/ui, react-i18next, sonner, zod):

- Feature folders `src/features/<feature>/{api,components,hooks,pages,utils}`; shared UI in `src/components` (`ui/` = primitives), shared helpers in `src/lib`, app wiring (router, query client, shell) in `src/app`. `@/*` aliases `src/*`.
- **Errors:** `lib/api-client.ts` (transport only) turns every failure into `ApiError { status, code, details }`; `app/query-client.ts` holds the policy (retry only network/5xx; global toast for mutation and background-refetch errors, opt out with `meta: { skipGlobalErrorToast: true }`); `lib/get-error-message.ts` maps codes to `common:errors.*` and validation details to `common:validation.*`; pages show inline and field errors.
- **Current user** = query `['auth', 'me']` (`useCurrentUser`). Every identity change goes through `setCurrentUser`, which clears per-user caches. Ownership and admin UI are display only; the API decides.
- **Query keys** come from the factories (`petQueryKeys`, `applicationQueryKeys`, `conversationQueryKeys`, `userQueryKeys`, `adminQueryKeys`) and include every request parameter.
- **i18n:** namespaces `common`, `pets`, `auth`, `applications`, `admin`, `messages`, `profile`. Store translation keys in state and translate on render, so a language change applies.
- Tests replace the transport with `http.defaults.adapter` (`lib/testing/mock-http-adapter.ts`).

**Shared library** (`packages/shared/models`, `@pet-adoption/models`): types, constants and state machines used by both apps. Plain TypeScript, no runtime dependencies; zod schemas stay in the apps.

**Environments and operations** (README "Running locally", architecture.md §6, deployment.md):

- **Local development:** `docker compose up -d` starts only MongoDB (single-node `rs0`, host port 27018). **Never run `docker compose down -v` on the main project:** it deletes the dev database.
- **Docker QA:** `docker-compose.qa.yml` through `pnpm qa:*` only; its names are checked by `src/scripts/qa/qa-config.ts`, so change both together. The root `.env` (from `.env.example`) holds only `QA_SESSION_SECRET`. `VITE_API_URL` is a build argument of the web image and must be reachable from the browser.
- **Live demo:** Cloudflare Pages + a Pages Function proxy, Render Free, Atlas Free and Cloudinary (deployment.md "Live demo", `.env.render.example`). The owner's private procedures are in `docs/learning/archive/managed-ops-runbook.md` (gitignored).
- **Self-hosted reference** (prepared, not used): `docker-compose.prod.yml`, `Caddyfile`, `.env.production` (plain `NAME=value` lines only) and `scripts/backup.sh` (POSIX `sh`; backups outside the repository, which is the Docker build context). Keep the compose file in sync with `core/config/env.ts` and the script's paths with deployment.md §8 and §9.
- **Production data:** never run seed, reset, migration, backfill or other write commands against production yourself. `pnpm prod:seed` is a dry run; a real run needs `--confirm-prod --confirm-host=<host>` and the owner's explicit go-ahead. The public README deliberately doesn't document it: read `src/scripts/demo/seed-demo.ts` and `demo-config.ts`, and the owner's notes in `docs/learning/production-demo-seed-strategy.md` (gitignored). `DEMO_PASSWORD` is the owner's secret (the demo accounts' login on the live site): never ask for it, print it or write it to a file. The local dev database is also named `pet-adoption`, so restoring a production dump needs `--nsFrom 'pet-adoption.*' --nsTo '<other>.*'`.

## Commands

Run tasks through Nx with pnpm:

```sh
pnpm nx run-many -t lint typecheck test   # full check (CI also runs build: .github/workflows/ci.yml)
pnpm nx test @pet-adoption/api            # uses an in-memory replica set
pnpm nx test @pet-adoption/api -- src/features/pets/pet.controller.spec.ts   # one spec (run from the repo root)
pnpm nx e2e @pet-adoption/web-e2e         # Playwright; starts its own API (:3334, in-memory DB) and a production build of the web (:4201, dist/e2e/web); failure traces in apps/web-e2e/test-results
pnpm nx serve @pet-adoption/api           # http://localhost:3333/api
pnpm nx dev @pet-adoption/web             # http://localhost:4200
pnpm dev:seed                             # demo data into the dev database (dev API must run)
pnpm qa:up / qa:seed / qa:reset --yes     # Docker QA at http://127.0.0.1:4203 (see README)
pnpm prod:seed                            # live demo: dry run only (needs the owner's private DEMO_PASSWORD; see seed-demo.ts)
pnpm admin:grant <email> --yes            # make a registered user an admin (without --yes: dry run)
pnpm audit:verify                         # check the admin audit log's hash chain
```

Environment note observed on the owner's machine: the Nx daemon may hang (use `NX_DAEMON=false`). If Nx reports the workspace is out of sync, run `pnpm nx sync` and commit the resulting tsconfig changes.

## Conventions

- Strict TypeScript; Prettier with single quotes; ESLint flat config.
- `const` arrow functions for functions and components; components exported as named exports (`export { PetCard };`).
- File names in kebab-case (`pet-card.tsx`, `pet.controller.ts`). Tests sit next to code as `*.spec.ts`.
- Comments explain only what the code can't: business rules, security decisions, concurrency, workarounds and why an obvious alternative is wrong. Don't add comments that restate the code, and don't reference ticket or batch ids (`P0-4`) that go stale.
- API error responses are `{ code, details? }` with stable codes (e.g. `PET_NOT_FOUND`, `VALIDATION_FAILED`); the API sends no display text, the web translates codes. New codes need `common:errors.*` translations in `en` and `sr`.
- Run Prettier only on files you changed, with `--end-of-line auto` (working copies use Windows line endings), and only if the file was already formatted (`prettier --check` first): several Markdown docs aren't, and formatting them rewrites untouched lines.
- User-facing text goes through i18n, in both `en` and `sr`.

### UI conventions (web)

Details and primitives in [docs/design-system.md](docs/design-system.md).

- **Clickable controls show they are clickable.** Every control that performs an action is a real `<button>`, `<a>`/`Link` or `Button` and shows a pointer on hover (`Button` and `NativeSelect` set it; `styles/base.css` covers raw buttons, file pickers, checkboxes, radios and `summary`). Don't add `onClick` to a `div`/`span` to get a pointer, and don't give a pointer to decorative icons, plain text or disabled controls. Keep the global focus outline.
- **Required fields have a visible `*`.** Decide requiredness from the form's zod schema and the API, never from looks: use `<Label required>` (or `FormField required`) and set `required` on the control too, since that is what screen readers announce. Optional fields get no `*` (keep "(optional)" in their label). Forms with more than one field show `<RequiredFieldsNote />` once at the top, except sign-in and registration (short, familiar forms where every field is required; the `*` stays). Don't change validation to match the marker; report unclear cases.
- **Forms validate with `useFormValidation`** (`lib/use-form-validation.ts`, rules in design-system.md "Form validation and errors"): submit stays enabled (disabled only while sending); no field errors before the first submit; a failed submit (client or server `VALIDATION_FAILED`) focuses the first invalid field; afterwards errors clear on change once valid and new ones show on blur. Wire `formRef`, `fieldChanged`, `fieldBlurred`, `validateForSubmit` and `getError` instead of per-form error state, and show messages with `FieldError` (no live region).
- **Confirm destructive or final actions with `ConfirmDialog`** (`components/confirm-dialog.tsx`): title, consequence, Cancel and a labelled confirm button; pass `onConfirm` a promise (`mutation.mutateAsync`). Don't build inline confirmations or use `window.confirm`; reversible actions don't ask.
- **Hint where users could misunderstand.** When a field, action, status, restriction or term could reasonably be misread, add one concise, contextual hint, worded to match the real behaviour. Use an inline hint (muted text linked with `aria-describedby`) for anything needed before submitting. Use a tooltip only for supplementary detail on an icon, status or secondary control, and never for required-field info, validation errors or warnings. There is no tooltip primitive yet: before the first tooltip, add one that works with keyboard and touch (not `title=`). Icon-only buttons need an `aria-label`. Don't add hints that repeat the label or tooltips on every button.

## Working agreements

- Prefer simple, maintainable solutions. Explain why before adding any dependency.
- Do not reintroduce removed Nx-generated placeholder apps/libs. Do not restructure the monorepo without a concrete reason.
- Work in small, coherent steps; explain important decisions and trade-offs briefly (relate to Vue when useful), without lengthy tutorials.
- Inspect only the files relevant to the task; do not repeat investigations already recorded in `docs/progress.md`.
- Reuse existing architecture, utilities, types and patterns instead of creating duplicates.
- Run the checks the testing policy above calls for, and fix regressions you introduce.
- Never make unrelated refactors, and never overwrite or discard existing changes without asking first.
- Treat authentication, authorization, input validation and database access as security-sensitive. Never trust client-supplied user IDs or ownership claims; enforce permissions on the server and test unauthorized access.
- If blocked, explain the specific issue and ask for the missing information instead of repeatedly investigating.

## Documentation upkeep

Part of every code or behaviour change, not a separate task:

- Identify the source-of-truth documents the change affects: `docs/requirements.md` (behaviour, rules), `docs/architecture.md` (structure, flows), `README.md` (features, setup, commands, testing), `docs/deployment.md` and `.env*.example` (configuration, operations), `docs/manual-qa-test-cases.csv` (user-visible behaviour), `docs/progress.md` (status) and this file (conventions, invariants).
- Update only those, with small targeted edits. Each fact lives in one document; elsewhere, link to it. Routine fixes, styling and internal refactors that don't change structure need no architecture update.
- Check every edit against the implemented code; don't describe planned behaviour as implemented.
- Tracked docs are public: use placeholders for hosts, account names, personal paths and secrets.
- In the report, list the documents updated, or say that none needed changes.

## Learning notes

`docs/learning/` (gitignored) holds the owner's personal learning notes. Touch it only when the owner explicitly asks for learning notes or a learning session, and then follow [docs/learning/CONVENTIONS.md](docs/learning/CONVENTIONS.md). During normal development, never create, update or delete anything there.

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
- Avoid unnecessary refactoring, speculative improvements and new dependencies.
- Explain important decisions and unfamiliar concepts briefly, especially React, Express, TypeScript and backend architecture.
- Don't repeat explanations or summarize every file inspected.
- Report changed files, checks performed, their results and any remaining concerns concisely.
- Never skip necessary validation, security checks or tests just to reduce usage.
