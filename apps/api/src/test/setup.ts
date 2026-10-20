import { rm } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';
import mongoose from 'mongoose';

import { resetRateLimits } from '../middleware/rate-limit';

// Runs before the test file imports the app, so `env` picks it up.
process.env.UPLOADS_DIR = inject('uploadsDir');

beforeAll(async () => {
  // The in-memory replica set started by global-setup.ts (supports transactions).
  await mongoose.connect(inject('mongoUri'));

  // Start from an empty database, then rebuild the schema indexes (e.g. the
  // unique email index) so tests behave like production. `init()` waits for
  // the automatic index build so it cannot race with the drop.
  const models = Object.values(mongoose.connection.models);

  await Promise.all(models.map((model) => model.init()));
  await mongoose.connection.db?.dropDatabase();
  await Promise.all(models.map((model) => model.createIndexes()));
});

afterEach(async () => {
  // Every test request comes from the same IP, so counters must not carry over.
  resetRateLimits();

  // Delete documents but keep collections and their indexes.
  const collections = await mongoose.connection.db?.collections();

  await Promise.all(
    (collections ?? []).map((collection) => collection.deleteMany({})),
  );

  // Uploaded files from this test; storage recreates the directory as needed.
  await rm(inject('uploadsDir'), { recursive: true, force: true });
});

afterAll(async () => {
  await mongoose.disconnect();
});
