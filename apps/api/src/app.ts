import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { adminRouter } from './features/admin/admin.routes';
import { applicationRouter } from './features/applications/application.routes';
import { authRouter } from './features/auth/auth.routes';
import { sessionMiddleware } from './features/auth/session';
import { conversationRouter } from './features/conversations/conversation.routes';
import { petRouter } from './features/pets/pet.routes';
import { userRouter } from './features/users/user.routes';
import { isDatabaseReady } from './core/config/database';
import { NotFoundError } from './core/errors/app-error';
import { asyncHandler } from './core/middleware/async-handler';
import { requestLogger } from './core/middleware/request-logger';
import { errorHandler } from './core/middleware/error-handler';
import { writeIpRateLimit } from './core/middleware/rate-limit';
import { requireProxySecret } from './core/middleware/require-proxy-secret';
import { requireTrustedOrigin } from './core/middleware/require-trusted-origin';
import { serveLocalFiles } from './core/storage/local-file-storage';
import { env } from './core/config/env';

export const app: Express = express();

app.disable('x-powered-by');

// Which proxies' X-Forwarded-* headers to believe (client IP for the per-IP
// rate limits, HTTPS for `Secure` cookies). From TRUST_PROXY, validated at
// startup; it must match the real proxies in front of the API.
app.set('trust proxy', env.trustProxy);

/**
 * Security headers for a JSON API (helmet). The API serves no HTML, so the
 * CSP allows nothing and forbids framing. HSTS is left to the TLS-terminating
 * proxy, which knows the real domain; the web app's own headers (CSP
 * for the built app) belong in its nginx config. Headers are defense in depth,
 * not a substitute for the checks in the handlers.
 */
const apiSecurityHeaders = (
  crossOriginResourcePolicy: 'same-origin' | 'cross-origin',
) =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: crossOriginResourcePolicy },
    frameguard: { action: 'deny' },
    strictTransportSecurity: false,
  });

// First, so every response (photos, errors, 404s) gets a request id and a
// log line, and later code runs in the request's logging context.
app.use(requestLogger);

// Second: with PROXY_SECRET set, requests that didn't come through the
// reverse proxy are refused before any rate limit, body or session work.
app.use(requireProxySecret(env.proxySecret));

// Uploaded pet photos (public), local storage only: with Cloudinary, browsers
// load them from Cloudinary's CDN. Before CORS and sessions: plain image
// requests need neither. The web app shows them from another origin, so they
// must allow cross-origin embedding.
if (env.storageDriver === 'local') {
  app.use(
    '/uploads',
    apiSecurityHeaders('cross-origin'),
    serveLocalFiles(env.uploadsDir),
  );
}

app.use(apiSecurityHeaders('same-origin'));

app.use(
  cors({
    origin: env.corsOrigin,
    // Lets the browser send and receive the session cookie cross-origin.
    credentials: true,
  }),
);

app.use(requireTrustedOrigin(env.corsOrigin));

// Per-IP backstop for every change outside /api/auth, before the body and the
// session are read. Per-user limits are on the routes. The client IP comes
// from `trust proxy` (above), so it is only as reliable as that setting.
app.use('/api', writeIpRateLimit);

app.use(express.json());

app.use(sessionMiddleware);

// Liveness: the process is up and answering. Doesn't touch the database.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Readiness: this instance can serve requests (MongoDB answers a ping), for a
// load balancer or platform health check. A failure is a bare 503: no
// connection details or error messages.
app.get(
  '/api/ready',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (await isDatabaseReady()) {
      res.json({ status: 'ok' });
      return;
    }

    res.status(503).json({ code: 'DATABASE_UNAVAILABLE' });
  }),
);

app.use('/api/auth', authRouter);
app.use('/api/pets', petRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', userRouter);
app.use('/api', applicationRouter);
app.use('/api', conversationRouter);

// Any /api path no router handled: a JSON 404 instead of Express's HTML page.
// Must stay after every API router and before the error handler.
app.use('/api', (req, res, next) => {
  next(new NotFoundError('ROUTE_NOT_FOUND'));
});

app.use(errorHandler);
