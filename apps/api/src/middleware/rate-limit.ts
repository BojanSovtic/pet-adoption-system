import type { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator, MemoryStore, rateLimit } from 'express-rate-limit';

import { TooManyRequestsError } from '../errors/app-error';

const WINDOW_MS = 15 * 60 * 1000;
const AUTH_ATTEMPTS_PER_IP = 20;
const FAILED_LOGINS_PER_ACCOUNT_AND_IP = 5;

// In-memory counters are per process, which fits a single API instance.
// Running several instances would need a shared store (e.g. MongoDB or Redis).
const ipStore = new MemoryStore();
const loginStore = new MemoryStore();
const adminReadStore = new MemoryStore();
const adminWriteStore = new MemoryStore();

/**
 * Admin limits, per admin account (not per IP). They run after
 * `requireAdmin`, so the key is the user id from the server-side session:
 * spoofed `X-Forwarded-For` headers can't change it, and admins behind one
 * office IP don't share a budget.
 *
 * - Reads: 300 per 15 minutes, about one request every 3 seconds for a whole
 *   working session; the pages debounce search, so normal use stays far below.
 * - Changes (roles, suspensions, listing moderation): 30 per 15 minutes,
 *   enough for deliberate one-by-one decisions but not for a runaway script
 *   or a hijacked session mass-changing accounts.
 */
const ADMIN_READS_PER_ADMIN = 300;
const ADMIN_CHANGES_PER_ADMIN = 30;

const rejectWithRateLimitError = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  next(new TooManyRequestsError('RATE_LIMITED'));
};

const normalizeEmail = (email: unknown): string =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

const sharedOptions = {
  windowMs: WINDOW_MS,
  // Sends `RateLimit`/`RateLimit-Policy` headers, and `Retry-After` when blocked.
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rejectWithRateLimitError,
} as const;

/**
 * Caps all sign-in and registration attempts from one IP address
 * (password spraying across many accounts, sign-up spam).
 */
export const authIpRateLimit = rateLimit({
  ...sharedOptions,
  limit: AUTH_ATTEMPTS_PER_IP,
  store: ipStore,
});

/**
 * Caps failed logins for one account from one IP address. Successful logins
 * don't count. Keying by email alone would let anyone lock a victim out.
 */
export const loginRateLimit = rateLimit({
  ...sharedOptions,
  limit: FAILED_LOGINS_PER_ACCOUNT_AND_IP,
  skipSuccessfulRequests: true,
  store: loginStore,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip ?? '')}:${normalizeEmail(req.body?.email)}`,
});

/** The admin's id, set by `requireAdmin` (which must run first). */
const adminKey = (req: Request, res: Response): string => {
  const userId = (res.locals.auth as { userId?: string } | undefined)?.userId;

  if (!userId) {
    throw new Error('Admin rate limits must run after requireAdmin');
  }

  return `admin:${userId}`;
};

/** GET requests on /api/admin. See ADMIN_READS_PER_ADMIN. */
export const adminReadRateLimit = rateLimit({
  ...sharedOptions,
  limit: ADMIN_READS_PER_ADMIN,
  store: adminReadStore,
  keyGenerator: adminKey,
  skip: (req) => req.method !== 'GET',
});

/** Role changes, suspensions and moderation. See ADMIN_CHANGES_PER_ADMIN. */
export const adminWriteRateLimit = rateLimit({
  ...sharedOptions,
  limit: ADMIN_CHANGES_PER_ADMIN,
  store: adminWriteStore,
  keyGenerator: adminKey,
  skip: (req) => req.method === 'GET',
});

/** Clears all counters; used by tests so limits don't leak between them. */
export const resetRateLimits = (): void => {
  ipStore.resetAll();
  loginStore.resetAll();
  adminReadStore.resetAll();
  adminWriteStore.resetAll();
};
