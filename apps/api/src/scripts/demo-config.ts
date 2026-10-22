import path from 'node:path';

/**
 * Settings shared by the demo scripts (start-demo, seed-demo, reset-demo).
 * The demo has its own database, photo folder and ports, so it never touches
 * development data (database `pet-adoption`, photos in apps/api/uploads, ports
 * 3333/4200). Paths are relative to the repository root; run the scripts from
 * there (`pnpm demo:start` etc. do).
 */

/** Every demo database name must end with this; reset-demo refuses others. */
export const DEMO_DB_SUFFIX = '-demo';

export const DEMO_MONGODB_URI =
  process.env.DEMO_MONGODB_URI ??
  'mongodb://localhost:27018/pet-adoption-demo?directConnection=true';

/** Gitignored (`tmp/`) and separate from apps/api/uploads. */
export const DEMO_UPLOADS_DIR = path.resolve(
  process.env.DEMO_UPLOADS_DIR ?? 'tmp/demo-uploads',
);

/** Development photos; the demo scripts never write or delete here. */
export const DEV_UPLOADS_DIR = path.resolve('apps/api/uploads');

export const DEMO_API_PORT = 3335;
export const DEMO_WEB_PORT = 4202;

/** Where seed-demo sends its requests. Override to seed another stack. */
export const DEMO_API_URL =
  process.env.DEMO_API_URL ?? `http://localhost:${DEMO_API_PORT}/api`;

/** The database name in a MongoDB connection string. */
export const getDatabaseName = (uri: string): string =>
  new URL(uri).pathname.replace(/^\//, '');
