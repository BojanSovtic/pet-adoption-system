import type { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator, MemoryStore, rateLimit } from 'express-rate-limit';

import { TooManyRequestsError } from '../errors/app-error';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const WINDOW_MS = 15 * MINUTE;
const AUTH_ATTEMPTS_PER_IP = 20;
const FAILED_LOGINS_PER_ACCOUNT_AND_IP = 5;

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

type Window = { limit: number; windowMs: number };

/**
 * Limits on changes by signed-in users, per account (the user id from the
 * server-side session). Each kind has a short "burst" window and a daily
 * "sustained" window; both must have room. Every attempt counts, including
 * refused ones (validation errors, 409s, rejected photos), because refused
 * requests cost work too. Change the numbers here; nothing else needs to.
 *
 * - Applications: one per pet is allowed anyway (ALREADY_APPLIED). Someone
 *   looking for a pet applies to a handful in a session; 10 in 10 minutes and
 *   30 a day stops spamming owners without getting in a real adopter's way.
 * - New listings: the pet form validates in the browser, so failed attempts
 *   are rare. 10 in 10 minutes, 30 a day: generous for a person rehoming
 *   pets, too few for a spam run.
 * - Photo uploads (requests, each with up to 5 files): the most expensive
 *   write (receiving, decoding, re-encoding). A pet holds at most 5 photos,
 *   so 20 requests in 10 minutes and 100 a day cover filling or replacing the
 *   galleries of many pets.
 * - Messages (starting a conversation or replying): a real exchange about
 *   a pet is a few messages at a time; 30 in 10 minutes and 300 a day keeps
 *   a back-and-forth comfortable but stops message floods and spam runs.
 * - Other changes (edit or delete a pet, delete photos, accept/reject/
 *   withdraw applications): cheap and bounded by the data a user owns; 60 in
 *   10 minutes, 500 a day only stops runaway scripts.
 */
export const USER_WRITE_LIMITS = {
  applicationSubmit: {
    burst: { limit: 10, windowMs: 10 * MINUTE },
    sustained: { limit: 30, windowMs: DAY },
  },
  petCreate: {
    burst: { limit: 10, windowMs: 10 * MINUTE },
    sustained: { limit: 30, windowMs: DAY },
  },
  photoUpload: {
    burst: { limit: 20, windowMs: 10 * MINUTE },
    sustained: { limit: 100, windowMs: DAY },
  },
  messageSend: {
    burst: { limit: 30, windowMs: 10 * MINUTE },
    sustained: { limit: 300, windowMs: DAY },
  },
  otherWrite: {
    burst: { limit: 60, windowMs: 10 * MINUTE },
    sustained: { limit: 500, windowMs: DAY },
  },
} as const satisfies Record<string, { burst: Window; sustained: Window }>;

/**
 * All non-GET requests to /api outside /api/auth (which has its own limits)
 * from one IP address, signed in or not, counted before the session or body
 * is read. A backstop against many accounts (or anonymous floods) from one
 * address, not a per-user quota: it is generous because users behind one
 * NAT (an office, a school, a mobile carrier) share it.
 */
export const WRITES_PER_IP: Window = { limit: 500, windowMs: 10 * MINUTE };

// In-memory counters are per process, which fits a single API instance.
// Running several instances would need a shared store (e.g. MongoDB or Redis).
const stores: MemoryStore[] = [];

const createStore = (): MemoryStore => {
  const store = new MemoryStore();
  stores.push(store);
  return store;
};

const ipStore = createStore();
const loginStore = createStore();
const adminReadStore = createStore();
const adminWriteStore = createStore();

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

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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

/**
 * The signed-in user's id, set by `requireAuth`/`requireAdmin` (which must
 * run first) from the server-side session. Never from the body, the query,
 * a header or the client's idea of its role.
 */
const authenticatedUserId = (res: Response): string => {
  const userId = (res.locals.auth as { userId?: string } | undefined)?.userId;

  if (!userId) {
    throw new Error('User rate limits must run after requireAuth');
  }

  return userId;
};

/** See WRITES_PER_IP. Mounted on /api in app.ts. */
export const writeIpRateLimit = rateLimit({
  ...sharedOptions,
  ...WRITES_PER_IP,
  identifier: 'writes-per-ip',
  store: createStore(),
  skip: (req) => SAFE_METHODS.has(req.method) || req.path.startsWith('/auth/'),
});

/**
 * The burst and the sustained limit for one kind of change, as a list of
 * middleware to put right after `requireAuth`.
 */
const userWriteRateLimit = (kind: keyof typeof USER_WRITE_LIMITS) =>
  (['burst', 'sustained'] as const).map((span) =>
    rateLimit({
      ...sharedOptions,
      ...USER_WRITE_LIMITS[kind][span],
      identifier: `${kind}-${span}`,
      store: createStore(),
      keyGenerator: (req, res) => `${kind}:${authenticatedUserId(res)}`,
    }),
  );

/** POST /api/pets/:petId/applications. */
export const applicationSubmitRateLimit =
  userWriteRateLimit('applicationSubmit');
/** POST /api/pets. */
export const petCreateRateLimit = userWriteRateLimit('petCreate');
/** PUT /api/pets/:id/image and POST /api/pets/:id/images, before the body is read. */
export const photoUploadRateLimit = userWriteRateLimit('photoUpload');
/** POST /api/pets/:petId/conversations and POST /api/conversations/:id/messages. */
export const messageSendRateLimit = userWriteRateLimit('messageSend');
/** Editing/deleting pets and photos; accepting, rejecting, withdrawing applications. */
export const otherWriteRateLimit = userWriteRateLimit('otherWrite');

/** The admin's id, set by `requireAdmin` (which must run first). */
const adminKey = (req: Request, res: Response): string =>
  `admin:${authenticatedUserId(res)}`;

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
  for (const store of stores) {
    store.resetAll();
  }
};
