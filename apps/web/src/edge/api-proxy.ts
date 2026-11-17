/**
 * Edge code, not part of the browser app: the Cloudflare Pages Function in
 * `functions/api/[[path]].ts` (repository root) calls this for every `/api/*`
 * request to the Pages site and forwards it to the API (on Render). The site
 * and the API therefore share one origin, so the `SameSite=Lax` session
 * cookie and the API's Origin check (CSRF) work unchanged. Nothing in `src/`
 * imports this file, so it never reaches the browser bundle; it lives here to
 * get the web project's typecheck, lint and tests. Runs on the Workers runtime:
 * web-standard APIs only (fetch, Request, Response, Headers).
 */

/** Bindings configured on the Pages project; never visible to browsers. */
export type ApiProxyEnv = {
  /** The API's own origin, e.g. https://pet-adoption-api.onrender.com */
  API_ORIGIN?: string;
  /** Secret: the API's PROXY_SECRET. */
  PROXY_SECRET?: string;
};

// Must match the API (middleware/require-proxy-secret.ts).
export const PROXY_SECRET_HEADER = 'X-Proxy-Secret';
export const PROXY_CLIENT_IP_HEADER = 'X-Proxy-Client-Ip';

// Same rule as the API's config/proxy-secret.ts.
const SECRET_FORMAT = /^[\x21-\x7e]{32,}$/;

/**
 * Request headers never forwarded from the client: values only this proxy
 * may set (the secret, the client IP) and client-IP or forwarding headers a
 * client could forge. Cloudflare and the API's host add their own forwarding
 * headers to the outgoing request; the API ignores them for the client IP.
 */
const STRIPPED_REQUEST_HEADERS = [
  PROXY_SECRET_HEADER,
  PROXY_CLIENT_IP_HEADER,
  'Host',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Real-IP',
  'Forwarded',
  'True-Client-IP',
  'CF-Connecting-IP',
  'CF-Connecting-IPv6',
  'CF-IPCountry',
  'CF-Ray',
  'CF-Visitor',
  'CF-Worker',
  'CDN-Loop',
];

const errorResponse = (status: number, code: string): Response =>
  new Response(JSON.stringify({ code }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

/** The API origin, or null when the binding is missing or not a bare https origin. */
const readApiOrigin = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    return url.protocol === 'https:' && url.origin === value.replace(/\/$/, '')
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

export const proxyApiRequest = async (
  request: Request,
  env: ApiProxyEnv,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<Response> => {
  const apiOrigin = readApiOrigin(env.API_ORIGIN);
  const secret = env.PROXY_SECRET;

  // Fail closed: without a valid configuration nothing is forwarded. The
  // log names the problem, never the values.
  if (!apiOrigin || !secret || !SECRET_FORMAT.test(secret)) {
    console.error(
      'api proxy misconfigured: API_ORIGIN must be an https origin and ' +
        'PROXY_SECRET at least 32 visible ASCII characters',
    );
    return errorResponse(500, 'INTERNAL_SERVER_ERROR');
  }

  const url = new URL(request.url);
  const target = `${apiOrigin}${url.pathname}${url.search}`;

  // The client's address as Cloudflare's edge saw it; clients can't set this
  // header themselves. Read before the forged copies are removed.
  const clientIp = request.headers.get('CF-Connecting-IP');
  const headers = new Headers(request.headers);

  for (const name of STRIPPED_REQUEST_HEADERS) {
    headers.delete(name);
  }

  headers.set(PROXY_SECRET_HEADER, secret);

  if (clientIp) {
    headers.set(PROXY_CLIENT_IP_HEADER, clientIp);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;

  try {
    upstream = await fetchImpl(target, {
      method: request.method,
      headers,
      // Streamed, not buffered (photo uploads are up to 25 MB).
      body: hasBody ? request.body : undefined,
      // Return the API's redirects to the browser as they are; following
      // them here would resend the secret and cookies to wherever they point.
      redirect: 'manual',
      // Required by the fetch standard for a streamed request body.
      duplex: 'half',
    } as RequestInit);
  } catch {
    // The API is unreachable (not a slow start: waiting has no time limit).
    return errorResponse(502, 'SERVICE_UNAVAILABLE');
  }

  // Status, headers (including every Set-Cookie) and the streamed body as the
  // API sent them. The API sets its own security headers.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
};
