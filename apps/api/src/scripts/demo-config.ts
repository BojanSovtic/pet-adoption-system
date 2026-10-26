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

/** Where `pnpm demo:seed` sends its requests unless DEMO_API_URL is set. */
export const DEFAULT_DEMO_API_URL = `http://localhost:${DEMO_API_PORT}/api`;

/** The development/Docker API port, which may hold your own data. */
const DEV_API_PORT = '3333';

/**
 * `pnpm dev:seed` target: the local development API (apps/api/.env, database
 * `pet-adoption`). The Docker app stack uses the same port and database, so
 * seed-demo also checks that the API answering here runs the current code.
 */
export const DEV_API_URL = `http://localhost:${DEV_API_PORT}/api`;
/** The Docker QA API port (docker-compose.qa.yml), seeded only with --qa. */
const QA_API_PORT = '3336';

/**
 * Where seed-demo sends its requests.
 * - `--qa` (pnpm qa:seed): always exactly `qaApiUrl`; refused if DEMO_API_URL
 *   says something else, so the target can't silently change.
 * - `--dev` (pnpm dev:seed): always exactly DEV_API_URL, with the same rule.
 * - Otherwise (pnpm demo:seed): DEMO_API_URL or the demo API. The dev/Docker
 *   port 3333 needs --allow-port-3333, and the QA port is refused (use --qa).
 */
export const resolveSeedTarget = (
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  qaApiUrl: string,
): string => {
  const override = env.DEMO_API_URL;

  if (argv.includes('--dev')) {
    if (argv.includes('--qa')) {
      throw new Error('--dev and --qa cannot be combined.');
    }

    if (override && override !== DEV_API_URL) {
      throw new Error(
        `--dev always seeds the development API (${DEV_API_URL}), but DEMO_API_URL is "${override}". Unset DEMO_API_URL.`,
      );
    }

    return DEV_API_URL;
  }

  if (argv.includes('--qa')) {
    if (argv.includes('--allow-port-3333')) {
      throw new Error('--qa and --allow-port-3333 cannot be combined.');
    }

    if (override && override !== qaApiUrl) {
      throw new Error(
        `--qa always seeds the Docker QA stack (${qaApiUrl}), but DEMO_API_URL is "${override}". Unset DEMO_API_URL.`,
      );
    }

    return qaApiUrl;
  }

  const target = override ?? DEFAULT_DEMO_API_URL;
  let port: string;

  try {
    port = new URL(target).port;
  } catch {
    throw new Error(`DEMO_API_URL "${target}" is not a valid URL.`);
  }

  if (port === QA_API_PORT) {
    throw new Error(
      `${target} is the Docker QA API. Seed it with "pnpm qa:seed" instead.`,
    );
  }

  if (port === DEV_API_PORT && !argv.includes('--allow-port-3333')) {
    throw new Error(
      `${target} is the development/Docker API, which may hold your own data. ` +
        'Only seed it if that stack contains nothing but demo data, and pass --allow-port-3333.',
    );
  }

  return target;
};

/** The database name in a MongoDB connection string. */
export const getDatabaseName = (uri: string): string =>
  new URL(uri).pathname.replace(/^\//, '');
