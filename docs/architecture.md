# Architecture

Diagrams of the **current** implementation (verified against the code on 2026-10-21, after the Docker Compose, Playwright E2E and Axios steps; roles and the admin area added on 2026-10-27). For user-facing rules, see [requirements.md](requirements.md); for status, open issues and the roadmap, see [progress.md](progress.md); for conventions, see [../CLAUDE.md](../CLAUDE.md).

Legend: every diagram shows implemented behavior. Dashed arrows in §1 are build-time type imports; in §2b they are error paths.

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
  operator(["Operator with server access"])
  cli["pnpm admin:grant / admin:revoke / audit:verify<br/>apps/api/src/scripts/"]
  mongo[("MongoDB 8, single-node replica set<br/>Docker container (host port 27018)<br/>pets, users, sessions,<br/>adoptionapplications,<br/>adminaudits, auditchainheads,<br/>rolechangeguards")]

  browser -- "loads SPA" --> web
  browser -- "axios /api/*<br/>JSON + sid cookie<br/>(withCredentials, CORS)" --> api
  web -. "imports types<br/>(workspace:*)" .-> models
  api -. "imports types + constants<br/>(bundled inline)" .-> models
  api -- "Mongoose 9<br/>(pets, users, applications,<br/>admin audit; transactions)" --> mongo
  api -- "connect-mongo<br/>(sessions, same client)" --> mongo
  operator -- "runs" --> cli
  cli -- "changeUserRole / verifyAuditChain<br/>(only MONGODB_URI + optional<br/>AUDIT_HMAC_KEY)" --> mongo
  uploads[("Uploaded pet photos<br/>local disk (UPLOADS_DIR)<br/>dev: apps/api/uploads<br/>Docker: uploads_data volume<br/>(FileStorage interface)")]
  api -- "save / delete files" --> uploads
  browser -- "img src: /uploads/pets/…" --> api
```

- **Two separate apps.** The frontend calls the API directly at `VITE_API_URL` (read at build time); there is no Vite or nginx proxy. Section 6 shows how they run in Docker and in E2E tests. Ports 4200 and 3333 are different *origins* but the same *site*, so the API enables CORS with `credentials: true` and the `SameSite=Lax` session cookie still flows.
- **The shared library has no runtime dependencies.** It holds the API contract (`Pet`, `User`, `ApiErrorResponse`, input types, allowed values, length limits). Each app keeps its own zod schemas; the API's are checked against the shared types with `satisfies`.
- **One database connection.** The session store reuses Mongoose's MongoDB client instead of opening a second one (`auth/session.ts`).
- **Admins are created outside the API.** `pnpm admin:grant <email>` connects to the database directly and uses the same `changeUserRole` service as the admin area (§3c, §5b). No HTTP route can create the first admin. The command-line tools load only `config/env-file.ts` (`MONGODB_URI`, optional `AUDIT_HMAC_KEY`), not the web server's `config/env.ts`, so they don't need `SESSION_SECRET` or `CORS_ORIGIN`.
- **Photos are files, not database data.** A pet stores up to 5 storage keys in `images`; the API returns `images: [{ _id, url }]` and `imageUrl` (the first photo) built by the storage.
  - **Storage:** `storage/` defines a small `FileStorage` interface (`save`, `delete`, `publicUrl`) with a local-disk implementation, served at `/uploads` with `nosniff` and long-term caching. Object storage (S3, R2) would be a second implementation; nothing else changes.
  - **Upload:** `POST /api/pets/:id/images` checks sign-in, ownership and free photo slots first, then parses multipart with `multer` (in memory, at most 5 files of 5 MB in the field "images"). It detects JPEG, PNG or WebP from each file's bytes and stores the files under random names: all of them or none.
  - **The 5-photo limit is part of the update query** (`$expr` on the array size), so simultaneous uploads can't exceed it.
  - **New files are written first;** files are deleted only after the database no longer points to them. A failed database write removes the new files. Keys are never reused, so a file belongs to exactly one photo.
  - **Deleting:** `DELETE /api/pets/:id/images/:imageId` removes one photo. Deleting the pet removes all its photos too, after the transaction.
  - **Kept for existing clients:** `PUT /api/pets/:id/image` replaces all photos with one; `DELETE /api/pets/:id/image` removes all.
  - **Old records:** pets saved with a single `imageKey` are converted at startup (`backfillPetImages`).
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
  participant Client as http (axios instance)
  participant API as Express API

  User->>Page: submit form
  Page->>Page: zod petFormSchema.safeParse
  alt client validation fails
    Page-->>User: field errors (translated), no request
  else valid
    Page->>TQ: mutation.mutate(full pet)
    TQ->>Client: updatePet(id, input)
    Client->>API: PUT /api/pets/:id (JSON, withCredentials)
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
  - **Keys:** `petQueryKeys.list(query)` = `['pets', 'list', { search, species, status, sort, page, pageSize }]`, `petQueryKeys.detail(id)`, `applicationQueryKeys.mine(query)` / `.received(query)` = `['applications', 'mine' | 'received', { page, … }]` and `['auth', 'me']`. Invalidating `['pets']` refreshes every list and detail.
  - **The pet list keeps its state in the URL** (`?search=&species=&status=&sort=&page=`) through `useSearchParams`, so Back and shared links restore it. Search is debounced by 300 ms, and any change other than the page resets to page 1.
- **Errors are handled in three places:**
  - The Axios response interceptor (`lib/api-client.ts`) turns every failure into an `ApiError`, including network errors (`NETWORK_ERROR`, status 0).
  - The query client (`app/query-client.ts`) applies the cross-cutting rules: no retries on 4xx, a toast for mutation errors and background-refetch errors, and the user reset to `null` on `UNAUTHENTICATED`.
  - Pages show inline and field errors; the form above opts out of the toast with `meta.skipGlobalErrorToast`.
- **The UI hides what the API would refuse; the API stays authoritative.**
  - `isPetOwner(pet, currentUser)` decides whether Edit and Delete are shown.
  - The form redirects signed-out users to `/login` with `state.from`, and login sends them back. This also happens when a save returns 401, because the global handler clears the current user.

### 2b. API middleware pipeline

```mermaid
flowchart TB
  req(["HTTP request"]) -- "/uploads/*" --> files["static photo files<br/>(nosniff, immutable cache)"]
  req --> cors["cors<br/>origin = CORS_ORIGIN, credentials"]
  cors --> origin["requireTrustedOrigin<br/>unsafe method + foreign Origin → 403"]
  origin --> json["express.json<br/>bad JSON → 400 INVALID_JSON"]
  json --> session["sessionMiddleware<br/>loads req.session from the sid cookie"]
  session --> router{"router"}

  router -- "/api/health" --> health["{ status: 'ok' }"]
  router -- "/api/auth/*" --> rate["rate limiters<br/>(login, register only)"]
  router -- "POST/PUT/DELETE /api/pets/*<br/>all /api/applications/*<br/>POST /api/pets/:id/applications" --> auth["requireAuth<br/>reads the user (role, suspension) now<br/>missing → 401 UNAUTHENTICATED<br/>suspended → session ended,<br/>403 ACCOUNT_SUSPENDED"]
  router -- "/api/admin/* (every path,<br/>router-level)" --> admin["requireAdmin<br/>requireAuth, then role = admin<br/>→ 401 / 403 ADMIN_REQUIRED<br/>+ per-admin rate limits<br/>→ 429 RATE_LIMITED"]
  router -- "GET /api/pets, /api/pets/:id (public)<br/>/api/auth/me, /logout" --> controller

  rate --> validate["validateBody(zod)<br/>(POST/PUT with a body only)<br/>→ 400 VALIDATION_FAILED"]
  auth --> validate
  admin --> validate
  validate --> controller["asyncHandler(controller)<br/>checks ids, throws AppError<br/>no owned pet matched → 403 / 404"]
  controller --> service["service<br/>pet.service (owner-scoped queries)<br/>application.service (transactions)<br/>auth.service / user.service<br/>admin.service / user-role.service<br/>pet-moderation / admin-audit.service"]
  service --> model["Mongoose model<br/>PetModel / UserModel / ApplicationModel<br/>AdminAuditModel / AuditChainHeadModel<br/>RoleChangeGuardModel"]
  model --> db[("MongoDB")]
  controller --> ok(["JSON response / 201 / 204"])

  cors & origin & json & rate & auth & admin & validate & controller -. "next(error)" .-> handler["errorHandler<br/>→ { code, details? }<br/>logs only 500s"]
```

- **Controllers stay thin.** They read params and session, call a service, and map "not found" to `NotFoundError`. Services hold the database access.
- **Errors leave through one place.** Every error, including rate-limit, validation and origin errors, reaches `errorHandler`. Response bodies are always `{ code, details? }`; the web translates `code`.
- **Not every route has every step.**
  - Body validation runs only on routes with a JSON body (`POST /pets`, `PUT /pets/:id`, `POST /pets/:petId/applications`, `POST /auth/register`, `POST /auth/login`, `PUT /admin/users/:id/role`).
  - `requireAuth` runs on pet create, update, delete and photo routes and on every application route, *before* validation, so anonymous requests get 401 whatever the body.
  - `requireAdmin` is mounted on the whole `/api/admin` router (`router.use`), so it also runs for admin paths that match no route: access is denied by default. The admin rate limits run right after it (§5b).
  - Rate limiting runs on `register`/`login` (per IP and per IP+email) and on every admin request (per admin account).
  - Photo uploads (`POST /pets/:id/images`, `PUT /pets/:id/image`) check ownership (and free slots) before `multer` reads the multipart body.
- **Ownership is enforced in the query itself:** `findOneAndUpdate` / `findOneAndDelete` with `{ _id, owner: userId }`. When nothing matches, a second `exists` check decides between 403 `NOT_PET_OWNER` and 404 `PET_NOT_FOUND`. Pets are public, so this reveals nothing private.
- **`GET /api/pets` is paginated.** The query string is validated by `petListQuerySchema` (through `parseInput`), giving the same `VALIDATION_FAILED` errors as bodies.
  - **Parameters:** a name search (case-insensitive and escaped), `species` and `status` filters, a whitelisted `sort`, `page` (at most 10,000) and `pageSize` (default 12, at most 50).
  - **How the query runs:** filters apply before `skip`/`limit`, and `countDocuments` uses the same filter.
  - **Response:** `{ items, page, pageSize, totalItems, totalPages }`.
- **The application lists are paginated the same way** (`page`, `pageSize` default 10, at most 50; newest first with `_id` as tie-breaker). `/applications/mine` is scoped to the session user as applicant; `/applications/received` to the session user as `petOwner`. `/mine` also takes `pet=<id>`, which the pet page uses to fetch only that pet's newest application.

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
      C-->>UI: 200 public User incl. role (toPublicUser: no passwordHash; missing role → user)
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
  - The admin role is checked by `requireAdmin` (§3c). Browsing pets stays public.
- **Separate from the sign-in method:** `startUserSession` and `endUserSession` take only a user id. A future OAuth/OIDC callback would find or create a user and call the same function.

### 3c. Roles and authorization

```mermaid
flowchart LR
  visitor(["Visitor<br/>(signed out)"])
  user(["user<br/>(default for every account)"])
  admin(["admin"])

  subgraph public["Public"]
    browse["browse and view pets"]
  end
  subgraph signedIn["Signed in (requireAuth)"]
    post["post pets → becomes their owner"]
    apply["apply / withdraw (as applicant)"]
  end
  subgraph perPet["Per pet, not a role (owner-scoped queries)"]
    manage["edit / delete / photos of own pets"]
    decide["accept / reject applications for own pets"]
  end
  subgraph adminArea["/api/admin/* (requireAdmin)"]
    stats["stats + audit log"]
    users["list users, change roles,<br/>suspend / reinstate<br/>(not oneself, not admins,<br/>never the last admin)"]
    oversight["all pets: hide / restore listings<br/>all applications: read-only"]
  end

  visitor --> public
  user --> public & signedIn
  signedIn -. "owner of that pet" .-> perPet
  admin --> public & signedIn & adminArea
  admin -. "only for pets they own,<br/>like any user" .-> perPet
```

- **Two roles:** `user` and `admin` (`USER_ROLES` in the shared library). There is no "shelter" role: anyone signed in can post pets, and owning a pet is a relation to that pet (`pet.owner`), not a role. Admins get no shortcut around ownership or the adoption state machine; on someone else's pet they get the same 403/404 as any user.
- **Where the role comes from:** the `role` field on the user document (default `user`; missing on older users, which counts as `user`). The session stores only `userId`. `requireAuth` reads the user's `role` and `suspendedAt` from MongoDB on **every** request (one query; `requireAdmin` reuses it), so promotion, demotion and suspension take effect on the user's next request without signing in again, and nothing the client sends (body, URL, headers, the cached `/auth/me`) can grant access.
- **Suspended accounts:** `requireAuth` ends the session and answers 403 `ACCOUNT_SUSPENDED`; `/auth/me` ends it and answers 401 (the web shows the user as signed out); sign-in answers 403 `ACCOUNT_SUSPENDED` only after a correct password. Browsing stays public. Admins can't be suspended, so an active admin always remains.
- **Who can change a role or suspension:** only `changeUserRole`, `suspendUser` and `reinstateUser` (`admin/user-role.service.ts`), called by the admin endpoints (acting admin from the session) and, for roles, by the `admin:grant` / `admin:revoke` command (no actor; an operator with database access). Registration ignores any `role` field: `registerSchema` strips unknown keys and `createUser` writes only email, name and password hash.
- **The web** shows the Admin link and the `/admin` pages only when `/auth/me` says `role: 'admin'` (usability only). An `ADMIN_REQUIRED` response refetches `/auth/me`, so a demoted admin's UI updates; `ACCOUNT_SUSPENDED` signs the user out in the web; all admin query data is removed on every identity change (`setCurrentUser`).

## 4. Data model

### Implemented

```mermaid
erDiagram
  USER {
    ObjectId _id PK
    string email UK "trimmed, lowercase, max 254"
    string name "max 100"
    string passwordHash "Argon2id, select false, optional"
    string role "user | admin, default user, indexed; missing = user"
    date suspendedAt "null = active; set by an admin"
    date createdAt
    date updatedAt
  }
  ADMIN_AUDIT {
    ObjectId _id PK
    number seq UK "1, 2, 3, ... chain position"
    string action "user.role.changed | user.suspended | user.reinstated | pet.hidden | pet.restored | users.viewed | pets.viewed | applications.viewed"
    string outcome "succeeded | denied"
    ObjectId actor FK "ref User, the acting admin; absent for the CLI"
    ObjectId targetUser FK "ref User, optional"
    ObjectId targetPet FK "ref Pet, optional"
    object metadata "from/to role, reason, error code, page, filters used, row count"
    string source "admin-ui | cli"
    date createdAt
    string prevHash "hash of entry seq-1 (genesis: 64 zeros)"
    string hash "HMAC-SHA256 with AUDIT_HMAC_KEY, else SHA-256"
    boolean keyed
  }
  AUDIT_CHAIN_HEAD {
    string _id PK "'admin-audit' (single document)"
    number seq "last entry"
    string hash "last entry's hash"
  }
  ROLE_CHANGE_GUARD {
    string _id PK "'user-roles' (single document)"
    date changedAt "written first by every role change"
  }
  PET {
    ObjectId _id PK
    ObjectId owner FK "ref User, required, indexed, set from the session"
    string name "max 100"
    string species "dog | cat | rabbit | bird | rodent | other"
    number age "integer >= 0"
    string description "max 2000"
    string status "available | pending | adopted, default available"
    string sex "male | female | unknown, default unknown"
    string breed "optional, max 60, default empty"
    object compatibility "children, dogs, cats: yes | no | unknown, default unknown"
    string aloneTime "short | part-day | full-day | unknown, default unknown"
    date hiddenAt "null = public; set by an admin (moderation)"
    array images "0-5 x { _id, key }, e.g. key pets/uuid.jpg; the first is the main photo"
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
    ObjectId petOwner FK "ref User, copy of pet.owner (for owner lists)"
    ObjectId applicant FK "ref User, set from the session"
    string message "1-2000 chars"
    string status "pending | accepted | rejected | withdrawn"
    date createdAt
    date updatedAt
  }
  USER ||--o{ PET : "owns (owner)"
  USER ||--o{ ADOPTION_APPLICATION : "submits (applicant)"
  USER ||--o{ ADOPTION_APPLICATION : "receives (petOwner)"
  PET ||--o{ ADOPTION_APPLICATION : "receives"
  SESSION }o--|| USER : "userId (plain string, not a Mongoose ref)"
  USER ||--o{ ADMIN_AUDIT : "acts (actor)"
  USER ||--o{ ADMIN_AUDIT : "is affected (targetUser)"
  PET ||--o{ ADMIN_AUDIT : "is moderated (targetPet)"
```

- **Mongoose models:** `USER`, `PET`, `ADOPTION_APPLICATION`, `ADMIN_AUDIT`, `AUDIT_CHAIN_HEAD` and `ROLE_CHANGE_GUARD` (`users/`, `pets/`, `applications/`, `admin/`). `SESSION` is the `sessions` collection, managed by `connect-mongo`; it has no Mongoose model.
- **Admin audit log:** written in the same transaction as each change, so a change never exists without its record; refused attempts and list views get their own entry. No update or delete path exists in the app (model hooks refuse them). See §5b for the hash chain and its limits.
- **Hidden pets** (`hiddenAt` set) are left out of `GET /api/pets` and return 404 from `GET /api/pets/:id` except to their owner and admins. The API returns only a `hidden` flag, never who hid it.
- **`owner` and `applicant` come only from the session.** Pets expose the owner as an id only. Applicant name and email are returned only to the owner of the pet.
- **Pet profile facts** (`sex`, `breed`, `compatibility`, `aloneTime`) are optional in the API input. Pets stored before they existed lack them; `withProfileDefaults` fills `unknown`/empty in every response, so no migration is needed.
- **Pets created before ownership** have no `owner`. They stay visible, but nobody can edit, delete or apply for them until they are backfilled or removed (see progress.md).
- **Statuses are server-managed** and stripped from request bodies; they change only through the state machines below.
- **Pet list index:** `{ createdAt: -1, _id: -1 }` serves the default "newest" order (and "oldest", read backwards) without an in-memory sort. Name search (a case-insensitive "contains" match) and species/status filters are not indexed: a contains-regex can't use an index efficiently, and the filters have only three values each.
- **`petOwner` is a copy of the pet's owner,** set when the application is submitted, so `GET /applications/received` can filter, sort and page one collection instead of first loading all of the owner's pet ids. Pets never change owner, so the copy can't go stale. Applications created before the field existed are filled in at API startup (`backfillApplicationPetOwners`).
- **Application list indexes:** `{ applicant, createdAt: -1, _id: -1 }` and `{ petOwner, createdAt: -1, _id: -1 }` match the newest-first order of the two paginated lists.
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

### 5b. Administration

Admins see platform-wide counts, users, pets, applications and the audit log; they change roles, suspend and reinstate users, and hide and restore listings. Applications stay **read-only**: adoption decisions stay with owners and applicants (§5), so admins can't create a second accepted application or skip the pet lock. The application list leaves out the applicant's message.

| Endpoint (all behind `requireAdmin` + rate limits) | Purpose |
|---|---|
| `GET /api/admin/stats` | Users (total, admins, suspended), pets by status and hidden, applications by status, the 5 newest audited *changes* |
| `GET /api/admin/audit?action=&page=&pageSize=` | The audit log, newest first (not itself audited) |
| `GET /api/admin/users?search=&role=&status=&page=&pageSize=` | Users with role, suspension, pet and application counts; search matches name or email (escaped, any case); page size 20 (max 50). **Audited** (`users.viewed`) |
| `PUT /api/admin/users/:id/role` `{ role }` | Change a role |
| `POST /api/admin/users/:id/suspend` `{ reason? }` / `…/reinstate` | Suspend / lift a suspension |
| `GET /api/admin/pets?…&visibility=` | The pet list (public parameters, hidden pets included) with owners and `hiddenAt`. **Audited** (`pets.viewed`) |
| `POST /api/admin/pets/:id/hide` `{ reason? }` / `…/restore` | Hide / restore a listing |
| `GET /api/admin/applications?status=&page=&pageSize=` | All applications with pet, applicant and owner (no message). **Audited** (`applications.viewed`) |

**Rules** (in `user-role.service.ts` and `pet-moderation.service.ts`):
- Nobody changes their own role or suspends themselves.
- The last admin keeps the role.
- Admins can't be suspended; suspended users can't be made admins.
- Suspension keeps all data. A suspended applicant's pending applications stay pending: the owner can reject them, but accepting returns 409 `APPLICANT_SUSPENDED`.
- Hiding keeps the pet, its status and its applications; only new applications are refused (404, checked after the pet lock). The owner keeps seeing and managing it and can't unhide it (`hiddenAt` is in no input schema).

```mermaid
sequenceDiagram
  autonumber
  actor Op as Operator (server access)
  actor A as Admin (browser)
  participant CLI as pnpm admin:grant
  participant API as /api/admin/... (change)
  participant S as runAudited + service
  participant DB as MongoDB (transaction)

  Note over Op,CLI: First admin: the person registers in the app, then
  Op->>CLI: admin:grant <email> (dry run), then --yes
  CLI->>S: changeUserRole { target, role: admin, source: cli } (no actor)

  Note over A,API: Later: Users / Pets pages (inline confirmation, optional reason)
  A->>API: role / suspend / reinstate / hide / restore + sid cookie
  API->>API: requireAdmin (role + suspension read now) → rate limit (30 changes / 15 min / admin) → validateBody
  API->>S: { target from URL, actor from session, source: admin-ui }
  S->>DB: user changes: write the role-change guard first; listings: lock the pet first
  S->>DB: actor still an active admin? else 403 ADMIN_REQUIRED
  S->>DB: rules (own account, last admin, admin/suspended, target exists)
  S->>DB: apply the change + append the audit entry (same transaction)
  DB-->>S: commit, or abort: nothing kept
  alt a rule refused it (AppError)
    S->>DB: append an audit entry with outcome denied + the error code
    S-->>API: 403 / 404 / 409 { code }
  else
    S-->>API: 200 (public user or pet)
  end
```

- **Why the guard document:** each transaction alone would see another admin, so two admins demoting each other at the same moment could otherwise leave none; likewise a promotion and a suspension of the same user could otherwise both succeed. Every role or suspension change writes the same document first; MongoDB lets one transaction hold it, the other retries and then sees the result (both tested).
- **Effect on sessions:** nothing to revoke. The next request of the affected user is authorized against the current role and suspension (tested: a demoted admin gets 403, a suspended user's open session gets 403 `ACCOUNT_SUSPENDED` and is ended).
- **Rate limits** (`middleware/rate-limit.ts`): per admin account, keyed by the user id from the session (spoofed `X-Forwarded-For` headers don't matter): 300 reads and 30 changes per 15 minutes, 429 `RATE_LIMITED`. Counters are in process memory, like the sign-in limits: they reset on restart and are not shared between several API instances.

**The audit chain** (`admin-audit.service.ts`):
- **Appending:** every entry gets the next `seq`, the previous entry's hash as `prevHash`, and `hash` = HMAC-SHA256 (with `AUDIT_HMAC_KEY`) or SHA-256 (without a key) over its content. The single `AUDIT_CHAIN_HEAD` document is updated in the same transaction, which serializes concurrent appends.
- **Checking:** `pnpm audit:verify` (or `verifyAuditChain`) walks the chain and reports gaps, broken links, changed content and a head that doesn't match the last entry.
- **Trust boundary: tamper-evident, not tamper-proof.** The application can't change or delete entries, but anyone with database write access can.
  - Without the key, they can also rewrite the chain consistently.
  - With the key (kept outside the database), they can't forge entries, but they can still delete the newest entries and roll back the head.
  - Detecting that needs a copy of the head outside the database (planned with hosting; see production-readiness.md A3).

## 6. Runtime environments

### Docker Compose

```mermaid
flowchart LR
  browser(["Browser"])

  subgraph compose["docker-compose.yml"]
    direction TB
    web["web (profile app)<br/>nginx: static Vite build<br/>host :4200 → 80"]
    api["api (profile app)<br/>Node 22: API bundle + production deps<br/>host :3333, runs as non-root"]
    mongo[("mongodb (always)<br/>mongo:8, replica set rs0<br/>host :27018 → 27017")]
    dbvol[("volume mongodb_data")]
    upvol[("volume uploads_data")]
  end

  browser -- "loads SPA" --> web
  browser -- "/api/* + /uploads/*<br/>VITE_API_URL baked in at build" --> api
  api -- "mongodb://mongodb:27017" --> mongo
  mongo --- dbvol
  api --- upvol
```

- **Two modes.** `docker compose up -d` starts only `mongodb`, for running the apps with Nx. `docker compose --profile app up -d --build` also builds and starts `api` and `web`.
- **Start order:** `api` waits until `mongodb` is healthy (the health check also initiates the replica set on first start); `web` waits until `api` answers `/api/health`.
- **Images:** the API image is built from the Nx `prune` output (bundle plus a pruned lockfile). The web image serves the Vite build with nginx, which sends every client-side route to `index.html`.
- **Browser-facing addresses:** the browser calls the API at `localhost`, not through the Compose network, so `VITE_API_URL`, `CORS_ORIGIN` and `UPLOADS_BASE_URL` use host ports (`API_PORT`, `WEB_PORT` in the root `.env`).
- **Plain HTTP:** the API runs with `NODE_ENV=development` in Compose, so session cookies are not marked `Secure`.

### Docker QA stack

`docker-compose.qa.yml` (project `pet-adoption-qa`) runs the same Dockerfiles for manual QA. It shares nothing with the main stack above: different containers, network and volumes.

```mermaid
flowchart LR
  browser(["Browser<br/>http://127.0.0.1:4203"])

  subgraph qa["docker-compose.qa.yml (project pet-adoption-qa, network pet-adoption-qa)"]
    direction TB
    qweb["web: nginx + Vite build<br/>127.0.0.1:4203 → 80"]
    qapi["api<br/>127.0.0.1:3336 → 3333"]
    qmongo[("mongodb: own server<br/>database pet-adoption-qa<br/>127.0.0.1:27019 → 27017")]
    qdb[("volumes pet-adoption-qa_mongodb_data,<br/>pet-adoption-qa_mongodb_config")]
    qup[("volume pet-adoption-qa_uploads_data")]
  end

  browser -- "loads SPA" --> qweb
  browser -- "/api/* + /uploads/*" --> qapi
  qapi -- "mongodb://mongodb:27017/pet-adoption-qa" --> qmongo
  qmongo --- qdb
  qapi --- qup
```

- **Isolation by storage:** a separate MongoDB server and separate volumes, not just a different database name.
  - **Fixed connection:** the API's connection string is fixed in the QA file.
  - **Host names blocked:** `host.docker.internal` and `gateway.docker.internal` resolve to the container itself.
  - **Still reachable by raw IP:** the development MongoDB's published port 27018 can still be reached at the Docker host's IP addresses. Nothing in the QA configuration uses them.
- **Bound to `127.0.0.1`:** all three ports. The API's CORS origin is `http://127.0.0.1:4203`, so the QA session cookie (on `127.0.0.1`) never collides with the other environments' cookies on `localhost`.
- **Scripts:** `pnpm qa:up|ps|logs|down` always pass the QA file and project and refuse options such as `-v`.
  - **`pnpm qa:seed`** seeds exactly `http://127.0.0.1:3336/api`.
  - **`pnpm qa:reset`** checks the containers' project, volumes and database before emptying the QA data; it never deletes volumes. See `apps/api/src/scripts/qa-config.ts`.

### E2E tests

```mermaid
flowchart LR
  pw["Playwright (Chromium)<br/>apps/web-e2e"]
  web["Vite dev server<br/>localhost:4201"]
  api["Real API from source (tsx)<br/>localhost:3334"]
  db[("In-memory MongoDB replica set<br/>127.0.0.1:27031, empty on every run")]
  tmp[("Temporary uploads directory")]
  cli["admin:grant command<br/>(support/admin.ts)"]

  pw -- "drives the UI in a browser" --> web
  pw -- "test setup: register users,<br/>create pets, apply (support/api.ts)" --> api
  pw -- "make a test admin" --> cli
  cli --> db
  web -- "pages call VITE_API_URL" --> api
  api --> db
  api --> tmp
```

- **Admins in E2E** are created exactly like in production: the test registers a user through the API, then runs the real `admin:grant` command against the run's database (fixed port 27031, `E2E_MONGODB_URI` in `support/config.ts`). There is no test-only way to become an admin.

- **Isolated:** Playwright starts both servers itself (`reuseExistingServer: false`), so dev servers, Docker containers and dev data are never used.
- **No seed data:** each test creates uniquely named users and pets through the API, then checks the journeys in the UI.
- **No retries:** login and register share the per-IP rate limit, and retries would add attempts against the same API process.
