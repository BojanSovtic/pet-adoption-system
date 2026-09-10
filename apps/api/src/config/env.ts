import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({
  path: path.resolve(process.cwd(), 'apps/api/.env'),
});

const port = Number(process.env.PORT ?? 3333);
const mongodbUri = process.env.MONGODB_URI;
const mongodbTestUri = process.env.MONGODB_TEST_URI;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer');
}

if (!mongodbUri) {
  throw new Error('MONGODB_URI is required');
}

if (!mongodbTestUri) {
  throw new Error('MONGODB_TEST_URI is required');
}

export const env = {
  host: process.env.HOST ?? 'localhost',
  port,
  mongodbUri,
  mongodbTestUri,
};
