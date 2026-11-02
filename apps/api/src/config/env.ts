import path from 'node:path';

import { configureLogger, readLogLevel } from '../logging/logger';
import { loadEnvFile, readAuditKey, readMongodbUri } from './env-file';
import { readTrustProxy } from './trust-proxy';

// The web server's full configuration, validated at startup. Command-line
// tools that only touch the database use env-file.ts instead.
loadEnvFile();

const port = Number(process.env.PORT ?? 3333);
const mongodbUri = readMongodbUri();
const corsOrigin = process.env.CORS_ORIGIN;
const sessionSecret = process.env.SESSION_SECRET;

// Fails at startup if set but too short (it's read again where it's used).
readAuditKey();
// Fails at startup if malformed, unsafe, or missing in production.
const trustProxy = readTrustProxy();
// Fails at startup if not a known level; applies to every log line after this.
const logLevel = readLogLevel();
configureLogger({ level: logLevel });

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer');
}

if (!corsOrigin) {
  throw new Error('CORS_ORIGIN is required');
}

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET is required (at least 32 characters)');
}

const host = process.env.HOST ?? 'localhost';

export const env = {
  host,
  port,
  mongodbUri,
  corsOrigin,
  sessionSecret,
  isProduction: process.env.NODE_ENV === 'production',
  /** Express `trust proxy`; see config/trust-proxy.ts. */
  trustProxy,
  /** Minimum level written by the logger; see logging/logger.ts. */
  logLevel,
  /** Where uploaded files are written (local disk storage). */
  uploadsDir: path.resolve(
    process.cwd(),
    process.env.UPLOADS_DIR ?? 'apps/api/uploads',
  ),
  /** Public base URL of uploaded files; set it when the API runs behind a proxy. */
  uploadsBaseUrl:
    process.env.UPLOADS_BASE_URL ?? `http://${host}:${port}/uploads`,
};
