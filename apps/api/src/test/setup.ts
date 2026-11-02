import { rm } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';
import mongoose from 'mongoose';

import { enableTestPasswordHashing } from '../auth/password';
import { resetRateLimits } from '../middleware/rate-limit';

// Runs before the test file imports the app, so `env` picks it up.
process.env.UPLOADS_DIR = inject('uploadsDir');

// No log output during tests (every request logs a line). Tests that check
// logs capture them with `captureLogs` (test/log-capture.ts). Set LOG_LEVEL
// when running the tests to see the logs.
process.env.LOG_LEVEL ??= 'silent';

// Cheap Argon2 parameters, so concurrent sign-ups can't push tests past their
// timeout. Production parameters are checked in auth/password.spec.ts.
enableTestPasswordHashing();

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
