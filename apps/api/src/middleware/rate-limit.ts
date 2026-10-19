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

/** Clears all counters; used by tests so limits don't leak between them. */
export const resetRateLimits = (): void => {
  ipStore.resetAll();
  loginStore.resetAll();
};
