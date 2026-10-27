import dotenv from 'dotenv';
import path from 'node:path';

/**
 * Loads `apps/api/.env`, relative to the working directory (run from the
 * repository root). Variables already set in the environment win, so
 * Docker, CI and E2E values are never overridden. Safe to call repeatedly.
 */
export const loadEnvFile = (): void => {
  dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });
};

type Source = Readonly<Record<string, string | undefined>>;

/**
 * The only setting the database tools need. Kept apart from `config/env.ts`
 * so command-line tools (admin:grant, audit:verify) don't need the web
 * server's settings (SESSION_SECRET, CORS_ORIGIN).
 */
export const readMongodbUri = (source: Source = process.env): string => {
  const uri = source.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  return uri;
};

export const AUDIT_HMAC_KEY_MIN_LENGTH = 32;

/**
 * Optional key for the admin audit chain (see admin-audit.model.ts). With it,
 * someone who can write to the database but doesn't have the key can't
 * rewrite the log without the change being detected. Without it the chain
 * still detects edits made without recomputing it.
 */
export const readAuditKey = (source: Source = process.env): string | null => {
  const key = source.AUDIT_HMAC_KEY;

  if (!key) {
    return null;
  }

  if (key.length < AUDIT_HMAC_KEY_MIN_LENGTH) {
    throw new Error(
      `AUDIT_HMAC_KEY must be at least ${AUDIT_HMAC_KEY_MIN_LENGTH} characters`,
    );
  }

  return key;
};
