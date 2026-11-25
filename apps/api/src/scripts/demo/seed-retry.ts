import { isRepeatSafeRequest } from './seed-guards';

/**
 * Waiting and retrying for seed-demo, for an API that may be asleep (Render
 * Free) or briefly unreachable. Everything is bounded, and a request that
 * could change data is never sent twice: if its outcome is unknown, the seed
 * stops and says so. Rerunning is safe because every seed step first checks
 * what already exists.
 */

export const RETRY_LIMITS = {
  /** Tries per request, the first one included. */
  maxAttempts: 3,
  /** Wait before retry n: base × 2^(n-1), so 2 s, then 4 s. */
  baseDelayMs: 2_000,
  /** A longer Retry-After (e.g. the 15-minute sign-in window) isn't waited for. */
  maxRetryAfterMs: 60_000,
} as const;

/** What one try produced: a response, or no response at all. */
export type Attempt =
  | { kind: 'response'; status: number; retryAfter: string | null }
  | { kind: 'no-response' };

export type RetryDecision =
  | { action: 'use' }
  | { action: 'retry'; delayMs: number }
  | { action: 'uncertain' };

// Gateway errors: the request may have reached the API before the proxy gave
// up (or the API is still waking up). Only repeat-safe requests are retried.
const GATEWAY_STATUSES = new Set([502, 503, 504]);

const backoff = (attempt: number) =>
  RETRY_LIMITS.baseDelayMs * 2 ** (attempt - 1);

/** Retry-After in milliseconds, if it is a number of seconds. */
export const retryAfterMs = (header: string | null): number | null =>
  header !== null && /^\d+$/.test(header.trim())
    ? Number(header.trim()) * 1000
    : null;

/**
 * What to do after try number `attempt` (1-based):
 * - 429: the request was refused before it ran, so it can be repeated after
 *   a short Retry-After, whatever it is. A long wait is left to the caller.
 * - No response or a gateway error: repeated only if repeat-safe; otherwise
 *   it may have been applied, so the outcome is uncertain.
 * - Anything else (2xx, 4xx including validation and authorization, other
 *   5xx) is the answer and is used as it is.
 */
export const decideRetry = (
  method: string,
  apiPath: string,
  outcome: Attempt,
  attempt: number,
): RetryDecision => {
  const triesLeft = attempt < RETRY_LIMITS.maxAttempts;

  if (outcome.kind === 'response' && outcome.status === 429) {
    const wait = retryAfterMs(outcome.retryAfter) ?? backoff(attempt);

    return triesLeft && wait <= RETRY_LIMITS.maxRetryAfterMs
      ? { action: 'retry', delayMs: wait }
      : { action: 'use' };
  }

  const transient =
    outcome.kind === 'no-response' || GATEWAY_STATUSES.has(outcome.status);

  if (!transient) {
    return { action: 'use' };
  }

  if (!isRepeatSafeRequest(method, apiPath)) {
    return { action: 'uncertain' };
  }

  if (triesLeft) {
    return { action: 'retry', delayMs: backoff(attempt) };
  }

  // Out of tries: a gateway response is still an answer the caller reports.
  return { action: 'use' };
};

/** The outcome of a request that could have changed data is unknown. */
export class UncertainOutcomeError extends Error {}

export class ApiUnreachableError extends Error {}

export type Sleep = (ms: number) => Promise<void>;

export const sleep: Sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a request with the retry rules above. `send` performs one try (a
 * thrown error means no response: network error or timeout).
 */
export const sendWithRetry = async (
  method: string,
  apiPath: string,
  send: () => Promise<Response>,
  wait: Sleep = sleep,
): Promise<Response> => {
  const label = `${method} ${apiPath.split('?')[0]}`;

  for (let attempt = 1; ; attempt += 1) {
    let response: Response | null = null;

    try {
      response = await send();
    } catch {
      response = null;
    }

    const decision = decideRetry(
      method,
      apiPath,
      response
        ? {
            kind: 'response',
            status: response.status,
            retryAfter: response.headers.get('Retry-After'),
          }
        : { kind: 'no-response' },
      attempt,
    );

    if (decision.action === 'uncertain') {
      throw new UncertainOutcomeError(
        `${label} got ${response ? `HTTP ${response.status}` : 'no response'}, so it may or may not have been applied. ` +
          'It was not repeated. Check the data, then run the seed again: it only adds what is missing.',
      );
    }

    if (decision.action === 'retry') {
      // The body of a discarded response is never read.
      await response?.body?.cancel();
      await wait(decision.delayMs);
      continue;
    }

    if (!response) {
      throw new ApiUnreachableError(
        `${label} got no response after ${attempt} tries.`,
      );
    }

    return response;
  }
};

/**
 * Polls `probe` (one readiness check: true when ready, false or a throw when
 * not) until it succeeds or `timeoutMs` has passed. With `timeoutMs` 0 it
 * checks once. Returns the number of checks made.
 */
export const waitUntilReady = async (
  probe: () => Promise<boolean>,
  {
    timeoutMs,
    intervalMs,
    now = Date.now,
    wait = sleep,
  }: {
    timeoutMs: number;
    intervalMs: number;
    now?: () => number;
    wait?: Sleep;
  },
): Promise<number> => {
  const start = now();

  for (let checks = 1; ; checks += 1) {
    let ready = false;

    try {
      ready = await probe();
    } catch {
      ready = false;
    }

    if (ready) {
      return checks;
    }

    if (now() - start + intervalMs > timeoutMs) {
      throw new ApiUnreachableError(
        timeoutMs === 0
          ? 'The API is not ready.'
          : `The API was not ready after ${Math.round(timeoutMs / 1000)} s (${checks} checks).`,
      );
    }

    await wait(intervalMs);
  }
};
