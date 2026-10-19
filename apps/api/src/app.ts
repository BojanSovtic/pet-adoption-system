import cors from 'cors';
import express, { type Express } from 'express';

import { authRouter } from './auth/auth.routes';
import { sessionMiddleware } from './auth/session';
import { petRouter } from './pets/pet.routes';
import { errorHandler } from './middleware/error-handler';
import { requireTrustedOrigin } from './middleware/require-trusted-origin';
import { env } from './config/env';

export const app: Express = express();

if (env.isProduction) {
  // Behind a TLS-terminating proxy, so `secure` cookies work. Adjust the hop
  // count to the actual deployment.
  app.set('trust proxy', 1);
}

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

app.use(errorHandler);
