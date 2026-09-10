import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';

import { env } from '../config/env';

beforeAll(async () => {
  console.log('[ test ] Connecting to MongoDB...');
  await mongoose.connect(env.mongodbTestUri);
  console.log('[ test ] MongoDB connected');
});

afterEach(async () => {
  await mongoose.connection.db?.dropDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
});
