import express, { type Express } from 'express';

import { petRouter } from './pets/pet.routes';

export const app: Express = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/pets', petRouter);
