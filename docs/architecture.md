# Architecture

Diagrams of the **current** implementation (verified against the code on 2026-10-20, after the adoption applications step). For status, open issues and the roadmap, see [progress.md](progress.md); for conventions, see [../CLAUDE.md](../CLAUDE.md).

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
  mongo[("MongoDB 8, single-node replica set<br/>docker-compose (host port 27018)<br/>pets, users, sessions,<br/>adoptionapplications")]

  browser -- "loads SPA" --> web
  browser -- "fetch /api/*<br/>JSON + sid cookie<br/>(credentials: include, CORS)" --> api
  web -. "imports types<br/>(workspace:*)" .-> models
  api -. "imports types + constants<br/>(bundled inline)" .-> models
  api -- "Mongoose 9<br/>(pets, users, applications;<br/>transactions)" --> mongo
  api -- "connect-mongo<br/>(sessions, same client)" --> mongo
  uploads[("Uploaded pet photos<br/>local disk: apps/api/uploads<br/>(FileStorage interface)")]
  api -- "save / delete files" --> uploads
  browser -- "img src: /uploads/pets/…" --> api
```

- **Two separate apps.** The frontend calls the API directly at `VITE_API_URL`; there is no Vite proxy. Ports 4200 and 3333 are different *origins* but the same *site*, so the API enables CORS with `credentials: true` and the `SameSite=Lax` session cookie still flows.
- **The shared library has no runtime dependencies.** It holds the API contract (`Pet`, `User`, `ApiErrorResponse`, input types, allowed values, length limits). Each app keeps its own zod schemas; the API's are checked against the shared types with `satisfies`.
- **One database connection.** The session store reuses Mongoose's MongoDB client instead of opening a second one (`auth/session.ts`).
- **Photos are files, not database data.** A pet stores only an `imageKey`; the API returns `imageUrl` built by the storage.
  - **Storage:** `storage/` defines a small `FileStorage` interface (`save`, `delete`, `publicUrl`) with a local-disk implementation, served at `/uploads` with `nosniff` and long-term caching. Object storage (S3, R2) would be a second implementation; nothing else changes.
  - **Upload:** `PUT /api/pets/:id/image` checks sign-in and ownership first, then parses multipart with `multer` (in memory, 5 MB maximum, one file in the field "image"). It detects JPEG, PNG or WebP from the file's bytes and stores the file under a random name.
  - **Replacing a photo:** the new file is written first; the old one is deleted after the database points to the new one. A failed database write removes the new file.
  - **Deleting:** `DELETE /api/pets/:id/image` removes the photo. Deleting the pet removes its photo too, after the transaction.
- **A replica set is required.** Adoption decisions use transactions, which a standalone MongoDB rejects, so `connectDatabase` refuses to start without one.
  - **Development:** `docker-compose.yml` runs a single-node replica set.
  - **Tests:** an in-memory replica set (`mongodb-memory-server`, `test/global-setup.ts`).

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

- **React Router only picks the page component.** There are no route loaders or actions; data is fetched inside components with TanStack Query.
  - **Keys:** `petQueryKeys.list(query)` = `['pets', 'list', { search, species, status, sort, page, pageSize }]`, `petQueryKeys.detail(id)`, `['applications', …]` and `['auth', 'me']`. Invalidating `['pets']` refreshes every list and detail.
  - **The pet list keeps its state in the URL** (`?search=&species=&status=&sort=&page=`) through `useSearchParams`, so Back and shared links restore it. Search is debounced by 300 ms, and any change other than the page resets to page 1.
- **Errors are handled in three places:**
  - `apiClient` turns every failure into an `ApiError`, including network errors (`NETWORK_ERROR`, status 0).
  - The query client (`app/query-client.ts`) applies the cross-cutting rules: no retries on 4xx, a toast for mutation errors and background-refetch errors, and the user reset to `null` on `UNAUTHENTICATED`.
  - Pages show inline and field errors; the form above opts out of the toast with `meta.skipGlobalErrorToast`.
- **The UI hides what the API would refuse; the API stays authoritative.**
  - `isPetOwner(pet, currentUser)` decides whether Edit and Delete are shown.
  - The form redirects signed-out users to `/login` with `state.from`, and login sends them back. This also happens when a save returns 401, because the global handler clears the current user.

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
  router -- "POST/PUT/DELETE /api/pets<br/>all /api/applications/*<br/>POST /api/pets/:id/applications" --> auth["requireAuth<br/>session user must exist<br/>→ 401 UNAUTHENTICATED"]
  router -- "GET /api/pets (public)" --> controller

  rate --> validate["validateBody(zod)<br/>(POST/PUT with a body only)<br/>→ 400 VALIDATION_FAILED"]
  auth --> validate
  validate --> controller["asyncHandler(controller)<br/>checks ids, throws AppError<br/>no owned pet matched → 403 / 404"]
  controller --> service["service<br/>pet.service (owner-scoped queries)<br/>application.service (transactions)<br/>auth.service / user.service"]
  service --> model["Mongoose model<br/>PetModel / UserModel / ApplicationModel"]
  model --> db[("MongoDB")]
  controller --> ok(["JSON response / 201 / 204"])

  cors & origin & json & rate & auth & validate & controller -. "next(error)" .-> handler["errorHandler<br/>→ { code, details? }<br/>logs only 500s"]
```

- **Controllers stay thin.** They read params and session, call a service, and map "not found" to `NotFoundError`. Services hold the database access.
- **Errors leave through one place.** Every error, including rate-limit, validation and origin errors, reaches `errorHandler`. Response bodies are always `{ code, details? }`; the web translates `code`.
- **Not every route has every step.**
  - Validation runs only on routes with a body (`POST /pets`, `PUT /pets/:id`, `POST /auth/register`, `POST /auth/login`).
  - Rate limiting runs only on `register` and `login`.
  - `requireAuth` runs on pet create, update and delete and on every application route, *before* validation, so anonymous requests get 401 whatever the body.
- **Ownership is enforced in the query itself:** `findOneAndUpdate` / `findOneAndDelete` with `{ _id, owner: userId }`. When nothing matches, a second `exists` check decides between 403 `NOT_PET_OWNER` and 404 `PET_NOT_FOUND`. Pets are public, so this reveals nothing private.
- **`GET /api/pets` is paginated.** The query string is validated by `petListQuerySchema` (through `parseInput`), giving the same `VALIDATION_FAILED` errors as bodies.
  - **Parameters:** a name search (case-insensitive and escaped), `species` and `status` filters, a whitelisted `sort`, `page` (at most 10,000) and `pageSize` (default 12, at most 50).
  - **How the query runs:** filters apply before `skip`/`limit`, and `countDocuments` uses the same filter.
  - **Response:** `{ items, page, pageSize, totalItems, totalPages }`.

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
- **Authentication vs authorization.**
  - `requireAuth` (`auth/require-auth.ts`) only answers "who is signed in?". It also rejects sessions whose user was deleted.
  - Ownership ("may this user change this pet?") lives in the pet service queries.
  - Browsing pets stays public. There are no admin roles.
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
    ObjectId owner FK "ref User, required, indexed, set from the session"
    string name "max 100"
    string species "dog | cat | other"
    number age "integer >= 0"
    string description "max 2000"
    string status "available | pending | adopted, default available"
    string imageKey "optional, e.g. pets/uuid.jpg (file in storage)"
    date createdAt
    date updatedAt
  }
  SESSION {
    string _id PK "session id (signed in the sid cookie)"
    date expires "TTL index removes expired sessions"
    string session "serialized cookie data + userId"
  }
  ADOPTION_APPLICATION {
    ObjectId _id PK
    ObjectId pet FK "ref Pet"
    ObjectId applicant FK "ref User, set from the session"
    string message "1-2000 chars"
    string status "pending | accepted | rejected | withdrawn"
    date createdAt
    date updatedAt
  }
  USER ||--o{ PET : "owns (owner)"
  USER ||--o{ ADOPTION_APPLICATION : "submits (applicant)"
  PET ||--o{ ADOPTION_APPLICATION : "receives"
  SESSION }o--|| USER : "userId (plain string, not a Mongoose ref)"
```

- **Mongoose models:** `USER`, `PET` and `ADOPTION_APPLICATION` (`users/`, `pets/`, `applications/`). `SESSION` is the `sessions` collection, managed by `connect-mongo`; it has no Mongoose model.
- **`owner` and `applicant` come only from the session.** Pets expose the owner as an id only. Applicant name and email are returned only to the owner of the pet.
- **Pets created before ownership** have no `owner`. They stay visible, but nobody can edit, delete or apply for them until they are backfilled or removed (see progress.md).
- **Statuses are server-managed** and stripped from request bodies; they change only through the state machines below.
- **Pet list index:** `{ createdAt: -1, _id: -1 }` serves the default "newest" order (and "oldest", read backwards) without an in-memory sort. Name search (a case-insensitive "contains" match) and species/status filters are not indexed: a contains-regex can't use an index efficiently, and the filters have only three values each.
- **Unique partial indexes on applications:**
  - `{ pet, applicant }` for statuses `pending`, `accepted` and `rejected`: one application per user and pet; a withdrawn one can be replaced.
  - `{ pet }` where `status: 'accepted'`: at most one accepted application per pet.

## 5. Adoption workflow

The state machines live in the shared library (`adoption-application.model.ts`), so the API enforces them and the web uses them to decide which buttons to show. Statuses change only through explicit actions; nothing sets a status directly.

### Application states

```mermaid
stateDiagram-v2
  [*] --> pending : submit (signed-in user, not the owner)
  pending --> accepted : accept (pet owner)
  pending --> rejected : reject (pet owner)
  pending --> rejected : autoReject (system, another application accepted)
  pending --> withdrawn : withdraw (applicant)
  accepted --> [*]
  rejected --> [*]
  withdrawn --> [*]
```

### Pet states

```mermaid
stateDiagram-v2
  [*] --> available : pet created
  available --> pending : first pending application
  pending --> available : last pending application rejected or withdrawn
  pending --> adopted : an application is accepted
  adopted --> [*]
```

- **How the two machines interact:** the pet status always follows from its applications. `application.service.ts` applies the pet transition in the same transaction as the application change, and `transitionPetStatus` rejects any change the pet machine doesn't allow.
- **When a transition fails:**
  - Wrong actor → 403 (`NOT_PET_OWNER` / `NOT_APPLICANT`).
  - Someone who is neither applicant nor owner → 404 `APPLICATION_NOT_FOUND`, because applications are private.
  - A final state → 409 `INVALID_STATUS_TRANSITION`.
  - An adopted pet → 409 `PET_NOT_AVAILABLE`.
- **Deleting a pet** is blocked by pending or accepted applications (409 `PET_HAS_ACTIVE_APPLICATIONS`). Otherwise its rejected and withdrawn applications are deleted with it, in one transaction.

### Accepting an application (one transaction)

```mermaid
sequenceDiagram
  autonumber
  participant O as Pet owner
  participant C as application.controller
  participant S as application.service
  participant DB as MongoDB (transaction)

  O->>C: POST /api/applications/:id/accept
  C->>S: transitionApplication(id, userId, 'accept')
  S->>S: role check (outside the transaction): owner? → else 403 / 404
  S->>DB: start transaction
  S->>DB: lockPet: write pet.updatedAt (a concurrent transaction on this pet now conflicts)
  S->>DB: pet must be pending, else 409 PET_NOT_AVAILABLE
  S->>DB: application must still be pending, else 409 INVALID_STATUS_TRANSITION
  S->>DB: application → accepted (conditional update)
  S->>DB: other pending applications for the pet → rejected
  S->>DB: pet pending → adopted
  alt any step fails
    DB-->>S: abort: no change is kept
  else
    DB-->>S: commit: all changes visible together
  end
  S-->>O: 200 owner view, or the error
```

- **Concurrency:** the first write locks the pet, so two simultaneous acceptances (or a withdraw racing a reject) can't both act on stale data. MongoDB raises a write conflict, `connection.transaction()` retries the losing transaction, and the retry sees the committed result (409). The unique "one accepted per pet" index is the final guarantee.
- **The same pattern** (lock the pet, check, write, adjust the pet status) is used for submit, reject and withdraw, so the pet status stays consistent even when the last two pending applications end at the same moment.
