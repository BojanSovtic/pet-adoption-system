import cors from 'cors';
import express, { type Express } from 'express';

import { petRouter } from './pets/pet.routes';
import { errorHandler } from './middleware/error-handler';

export const app: Express = express();

app.use(
  cors({
    origin: 'http://localhost:4200',
  }),
);

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/pets', petRouter);

app.use(errorHandler);
