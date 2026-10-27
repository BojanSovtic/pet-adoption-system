import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { adminRouter } from './admin/admin.routes';
import { applicationRouter } from './applications/application.routes';
import { authRouter } from './auth/auth.routes';
import { sessionMiddleware } from './auth/session';
import { petRouter } from './pets/pet.routes';
import { NotFoundError } from './errors/app-error';
import { errorHandler } from './middleware/error-handler';
import { requireTrustedOrigin } from './middleware/require-trusted-origin';
import { serveLocalFiles } from './storage/local-file-storage';
import { env } from './config/env';

export const app: Express = express();

app.disable('x-powered-by');

if (env.isProduction) {
  // Behind a TLS-terminating proxy, so `secure` cookies work. Adjust the hop
  // count to the actual deployment.
  app.set('trust proxy', 1);
}

/**
 * Security headers for a JSON API (helmet). The API serves no HTML, so the
 * CSP allows nothing and forbids framing. HSTS is left to the TLS-terminating
 * proxy, which knows the real domain (P0-4); the web app's own headers (CSP
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

// Uploaded pet photos (public). Before CORS and sessions: plain image
// requests need neither. The web app shows them from another origin, so they
// must allow cross-origin embedding.
app.use(
  '/uploads',
  apiSecurityHeaders('cross-origin'),
  serveLocalFiles(env.uploadsDir),
);

app.use(apiSecurityHeaders('same-origin'));

app.use(
  cors({
    origin: env.corsOrigin,
    // Lets the browser send and receive the session cookie cross-origin.
    credentials: true,
  }),
);

app.use(requireTrustedOrigin(env.corsOrigin));

app.use(express.json());

app.use(sessionMiddleware);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/pets', petRouter);
app.use('/api/admin', adminRouter);
app.use('/api', applicationRouter);

// Any /api path no router handled: a JSON 404 instead of Express's HTML page.
// Must stay after every API router and before the error handler.
app.use('/api', (req, res, next) => {
  next(new NotFoundError('ROUTE_NOT_FOUND'));
});

app.use(errorHandler);
