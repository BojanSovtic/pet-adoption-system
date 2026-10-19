import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';

import { env } from '../config/env';
import { resetRateLimits } from '../middleware/rate-limit';

beforeAll(async () => {
  console.log('[ test ] Connecting to MongoDB...');
  await mongoose.connect(env.mongodbTestUri);
  console.log('[ test ] MongoDB connected');

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
});

afterAll(async () => {
  await mongoose.disconnect();
});
