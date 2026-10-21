# Deployment notes

The app is **not deployed** and is not production-ready. This lists what a deployment would have to get right. The correct setup depends on the hosting architecture chosen later (one domain behind a reverse proxy, separate subdomains, a container platform, and so on), so treat these as requirements to check, not finished instructions.

## Same-site cookies

- Sign-in uses an HttpOnly session cookie with `SameSite=Lax`. The browser sends it with the API's `fetch`/XHR requests only when the web app and the API are on the **same site** (same registrable domain).
- **Works:** `app.example.com` + `api.example.com`, or one domain with the API under `/api` behind a reverse proxy.
- **Breaks sign-in:** the web app and the API on unrelated domains, e.g. two different hosting providers' default domains (`*.vercel.app` and `*.onrender.com`). That would need `SameSite=None; Secure` cookies **plus** CSRF tokens, because `SameSite` would no longer block cross-site requests.

## HTTPS and `Secure` cookies

- With `NODE_ENV=production` the session cookie is marked `Secure`, so it is only sent over HTTPS. Serve both the web app and the API over HTTPS.
- Docker Compose runs the API with `NODE_ENV=development` on purpose, because it serves plain HTTP on `localhost`.

## Reverse proxy and `trust proxy`

- With `NODE_ENV=production` the API sets Express `trust proxy` to `1` (one proxy hop) in `apps/api/src/app.ts`. Change it to match the real number of proxies in front of the API.
- It must be right: Express uses it to see that the original request was HTTPS (needed for `Secure` cookies) and to find the client IP (used by the rate limits). Too low breaks cookies; too high lets clients fake their IP.

## CORS and CSRF

- `CORS_ORIGIN` must be the exact public origin of the web app (scheme, host and port, e.g. `https://app.example.com`). The API allows credentialed CORS requests only from that one origin.
- The same value drives the CSRF check: state-changing requests with a different `Origin` header get 403 `UNTRUSTED_ORIGIN`. Allowing several web origins would need code changes.

## Environment variables

API (validated at startup in `apps/api/src/config/env.ts`):

| Variable           | Notes                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `production` enables `Secure` cookies and `trust proxy`.                                  |
| `SESSION_SECRET`   | Required, at least 32 random characters. Changing it signs everyone out.                  |
| `MONGODB_URI`      | Required. Must be a **replica set** (transactions); managed MongoDB services usually are. |
| `CORS_ORIGIN`      | Required. The web app's public origin.                                                    |
| `HOST`, `PORT`     | Where the API listens (default `localhost:3333`; use `0.0.0.0` in a container).           |
| `UPLOADS_DIR`      | Where photos are stored on disk.                                                          |
| `UPLOADS_BASE_URL` | Public URL of `/uploads`, e.g. behind a proxy or CDN.                                     |

Web (`apps/web`): `VITE_API_URL` is baked into the bundle **at build time** and must be the API address as the browser sees it. Changing it means rebuilding the web app.

## Uploaded photos

- Photos are stored on local disk. Most container platforms have an ephemeral disk that is wiped on redeploy, so either mount a persistent volume and set `UPLOADS_DIR`, or add an object-storage implementation of the `FileStorage` interface (`apps/api/src/storage/`), e.g. S3 or Cloudflare R2. Object storage needs the provider's SDK as a new dependency.
- **Deferred privacy improvement:** photos keep their original metadata (EXIF), which can include the GPS location where the photo was taken. Removing it would need an image library such as `sharp`.

## Rate limiting with several API instances

The sign-in and registration rate limits keep their counters in the API process's memory. That's correct for one instance. With several instances behind a load balancer, each would count separately (and counters reset on restart), so the limits would need a shared store such as Redis or MongoDB.

## Not covered yet

Logging and monitoring, backups, health-check-based restarts on the host, and a CI deployment step.
