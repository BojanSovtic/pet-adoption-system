# @pet-adoption/models

Types, constants and state machines shared by the API and the web app (`Pet`, `User`, `ApiErrorResponse`, input types, allowed values, length limits, the application and pet state machines). Plain TypeScript with no runtime dependencies; zod schemas stay in each app.

Imported as `@pet-adoption/models` (`workspace:*`). The API bundles it inline; the web app compiles it with Vite. It has `lint` and `typecheck` targets and no tests of its own: the state machines are tested through the API suite (`application-state.spec.ts`).
