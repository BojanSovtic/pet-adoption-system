# Architecture

Diagrams of the **current** implementation (verified against the code on 2026-10-19, commit `b06a917`). For status, open issues and the roadmap, see [progress.md](progress.md); for conventions, see [../CLAUDE.md](../CLAUDE.md).

Legend: solid lines and boxes = implemented. Dashed lines or anything labelled _planned_ = not implemented yet.

## 1. System architecture

```mermaid
flowchart LR
  subgraph nx["Nx workspace (pnpm)"]
    direction TB
    web["apps/web<br/>React 19 + Vite<br/>localhost:4200"]
    api["apps/api<br/>Express 4 (esbuild bundle)<br/>localhost:3333"]
    models["packages/shared/models<br/>@pet-adoption/models<br/>types + constants only"]
  end

  browser(["Browser"])
  mongo[("MongoDB 8<br/>docker-compose<br/>collections: pets, users, sessions")]

  browser -- "loads SPA" --> web
  browser -- "fetch /api/*<br/>JSON + sid cookie<br/>(credentials: include, CORS)" --> api
  web -. "imports types<br/>(workspace:*)" .-> models
  api -. "imports types + constants<br/>(bundled inline)" .-> models
  api -- "Mongoose 9<br/>(pets, users)" --> mongo
  api -- "connect-mongo<br/>(sessions, same client)" --> mongo
```

- **Two separate apps.** The frontend calls the API directly at `VITE_API_URL`; there is no Vite proxy. Ports 4200 and 3333 are different *origins* but the same *site*, so the API enables CORS with `credentials: true` and the `SameSite=Lax` session cookie still flows.
- **The shared library has no runtime dependencies.** It holds the API contract (`Pet`, `User`, `ApiErrorResponse`, input types, allowed values, length limits). Each app keeps its own zod schemas; the API's are checked against the shared types with `satisfies`.
- **One database connection.** The session store reuses Mongoose's MongoDB client instead of opening a second one (`auth/session.ts`).

## 2. Request lifecycle

Example: saving the edit form (`PUT /api/pets/:id`). The other pages follow the same path, using `useQuery` for reads.

### 2a. Frontend

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant Page as PetFormPage<br/>(route /pets/:id/edit)
  participant TQ as TanStack Query<br/>useMutation
  participant Client as apiClient (fetch)
  participant API as Express API

  User->>Page: submit form
  Page->>Page: zod petFormSchema.safeParse
  alt client validation fails
    Page-->>User: field errors (translated), no request
  else valid
    Page->>TQ: mutation.mutate(full pet)
    TQ->>Client: updatePet(id, input)
    Client->>API: PUT /api/pets/:id (JSON, credentials include)
    API-->>Client: 200 Pet  or  4xx/5xx { code, details? }
    alt success
      Client-->>TQ: Pet
      TQ->>TQ: onSuccess: invalidate ['pets'] and ['pets', id]
      TQ-->>User: toast + navigate to /pets/:id
    else error
      Client-->>TQ: throws ApiError { status, code, details }
      TQ-->>Page: mutation.error
      Page-->>User: inline message (getErrorMessage) + field errors (getFieldErrors)
    end
  end
```

- **React Router only picks the page component.** There are no route loaders or actions; data is fetched inside components with TanStack Query (`['pets']`, `['pets', id]`, `['auth', 'me']`).
- **Errors are handled in three places:**
  - `apiClient` turns every failure into an `ApiError`, including network errors (`NETWORK_ERROR`, status 0).
  - The query client (`app/query-client.ts`) applies the cross-cutting rules: no retries on 4xx, a toast for mutation errors and background-refetch errors, and the user reset to `null` on `UNAUTHENTICATED`.
  - Pages show inline and field errors; the form above opts out of the toast with `meta.skipGlobalErrorToast`.

### 2b. API middleware pipeline

```mermaid
flowchart TB
  req(["HTTP request"]) --> cors["cors<br/>origin = CORS_ORIGIN, credentials"]
  cors --> origin["requireTrustedOrigin<br/>unsafe method + foreign Origin → 403"]
  origin --> json["express.json<br/>bad JSON → 400 INVALID_JSON"]
  json --> session["sessionMiddleware<br/>loads req.session from the sid cookie"]
  session --> router{"router"}

  router -- "/api/health" --> health["{ status: 'ok' }"]
  router -- "/api/auth/*" --> rate["rate limiters<br/>(login, register only)"]
  router -- "/api/pets/*" --> validate

  rate --> validate["validateBody(zod)<br/>(POST/PUT with a body only)<br/>→ 400 VALIDATION_FAILED"]
  validate --> controller["asyncHandler(controller)<br/>checks ids, throws AppError"]
  controller --> service["service<br/>pet.service / auth.service / user.service"]
  service --> model["Mongoose model<br/>PetModel / UserModel"]
  model --> db[("MongoDB")]
  controller --> ok(["JSON response / 201 / 204"])

  cors & origin & json & rate & validate & controller -. "next(error)" .-> handler["errorHandler<br/>→ { code, details? }<br/>logs only 500s"]
```

- **Controllers stay thin.** They read params and session, call a service, and map "not found" to `NotFoundError`. Services hold the database access.
- **Errors leave through one place.** Every error, including rate-limit, validation and origin errors, reaches `errorHandler`. Response bodies are always `{ code, details? }`; the web translates `code`.
- **Not every route has every step.** Validation runs only on routes with a body (`POST /pets`, `PUT /pets/:id`, `POST /auth/register`, `POST /auth/login`). Rate limiting runs only on `register` and `login`.

## 3. Authentication flow

Email and password with **server-side sessions**. The browser only holds an opaque, HttpOnly `sid` cookie; the session data lives in MongoDB.

### 3a. Register / login

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (LoginPage)
  participant RL as Rate limiters
  participant C as auth.controller
  participant S as auth.service + user.service
  participant SS as session.ts + connect-mongo
  participant DB as MongoDB

  B->>RL: POST /api/auth/login { email, password }
  RL->>RL: per IP: 20 per 15 min (login + register)<br/>per IP+email: 5 failed logins per 15 min
  alt limit exceeded
    RL-->>B: 429 RATE_LIMITED + Retry-After
  else allowed
    RL->>C: validateBody(loginSchema), email trimmed + lowercased
    C->>S: authenticateWithPassword
    S->>DB: users.findOne({ email }).select('+passwordHash')
    S->>S: argon2.verify (dummy hash if no user, so timing is similar)
    alt wrong email or password
      S-->>B: 401 INVALID_CREDENTIALS (no cookie)
    else valid
      C->>SS: startUserSession(req, userId)
      SS->>DB: regenerate: delete old session, insert new { userId }
      SS-->>B: 200 public User + Set-Cookie sid (HttpOnly, SameSite=Lax, Secure in prod, 7 days)
      B->>B: setQueryData(['auth','me'], user), navigate /pets
    end
  end
```

Registration (`POST /api/auth/register`) follows the same path with only the per-IP limiter. It runs `registerWithPassword`, which hashes with Argon2id and calls `createUser`. A duplicate email is caught by the unique index and returns 409 `EMAIL_ALREADY_REGISTERED`. On success it calls the same `startUserSession`, so registering signs the user in.

### 3b. Who am I? / logout

```mermaid
sequenceDiagram
  autonumber
  participant UI as Web (useCurrentUser / UserMenu)
  participant MW as sessionMiddleware
  participant C as auth.controller
  participant DB as MongoDB

  UI->>MW: GET /api/auth/me (cookie sid)
  MW->>DB: sessions.findOne(sid)
  MW->>C: req.session.userId (or none)
  alt no session
    C-->>UI: 401 UNAUTHENTICATED → getCurrentUser returns null
  else session found
    C->>DB: users.findById(userId)
    alt user deleted
      C->>DB: destroy session
      C-->>UI: 401 UNAUTHENTICATED (cookie cleared)
    else user exists
      C-->>UI: 200 public User (toPublicUser: no passwordHash)
    end
  end

  UI->>C: POST /api/auth/logout
  C->>DB: endUserSession: delete session document
  C-->>UI: 204 + cleared sid cookie
  UI->>UI: setQueryData(['auth','me'], null)
```

- **Session fixation:** `startUserSession` always regenerates the session id. Tests confirm the pre-login cookie stops working.
- **CSRF:** `SameSite=Lax` plus `requireTrustedOrigin`, with no CSRF tokens. Requests without an `Origin` header (non-browser clients) are allowed.
- **Authentication only.** No route requires a session except `/me`. Pet create, edit and delete are currently open to everyone (planned: step 5, ownership).
- **Separate from the sign-in method:** `startUserSession` and `endUserSession` take only a user id. A future OAuth/OIDC callback would find or create a user and call the same function.

## 4. Data model

### Implemented

```mermaid
erDiagram
  USER {
    ObjectId _id PK
    string email UK "trimmed, lowercase, max 254"
    string name "max 100"
    string passwordHash "Argon2id, select false, optional"
    date createdAt
    date updatedAt
  }
  PET {
    ObjectId _id PK
    string name "max 100"
    string species "dog | cat | other"
    number age "integer >= 0"
    string description "max 2000"
    string status "available | pending | adopted, default available"
    string_array imageUrls "default []"
    date createdAt
    date updatedAt
  }
  SESSION {
    string _id PK "session id (signed in the sid cookie)"
    date expires "TTL index removes expired sessions"
    string session "serialized cookie data + userId"
  }
  SESSION }o--|| USER : "userId (plain string, not a Mongoose ref)"
```

- **`USER` and `PET` are Mongoose models** (`users/user.model.ts`, `pets/pet.model.ts`). `SESSION` is the `sessions` collection, managed by `connect-mongo`; it has no Mongoose model.
- **Pets and users are not linked yet.** No pet stores who posted it.
- **`status` can't change through the API yet.** It is server-managed and stripped from request bodies, so every pet stays `available` for now.

### Planned (not implemented)

```mermaid
erDiagram
  USER ||--o{ PET : "owns (planned: ownerId, step 5)"
  USER ||--o{ ADOPTION_APPLICATION : "submits (planned: step 6)"
  PET ||--o{ ADOPTION_APPLICATION : "receives (planned: step 6)"
```

The field names and statuses for applications are not decided yet; see the roadmap in [progress.md](progress.md).
