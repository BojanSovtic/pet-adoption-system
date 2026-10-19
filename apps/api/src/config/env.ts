import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({
  path: path.resolve(process.cwd(), 'apps/api/.env'),
});

const port = Number(process.env.PORT ?? 3333);
const mongodbUri = process.env.MONGODB_URI;
const mongodbTestUri = process.env.MONGODB_TEST_URI;
const corsOrigin = process.env.CORS_ORIGIN;
const sessionSecret = process.env.SESSION_SECRET;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer');
}

if (!mongodbUri) {
  throw new Error('MONGODB_URI is required');
}

if (!mongodbTestUri) {
  throw new Error('MONGODB_TEST_URI is required');
}

if (!corsOrigin) {
  throw new Error('CORS_ORIGIN is required');
}

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET is required (at least 32 characters)');
}

export const env = {
  host: process.env.HOST ?? 'localhost',
  port,
  mongodbUri,
  mongodbTestUri,
  corsOrigin,
  sessionSecret,
  isProduction: process.env.NODE_ENV === 'production',
};
