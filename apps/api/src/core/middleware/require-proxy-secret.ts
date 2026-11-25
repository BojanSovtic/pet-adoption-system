import type { RequestHandler } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

import { ForbiddenError } from '../errors/app-error';

export const PROXY_SECRET_HEADER = 'X-Proxy-Secret';
export const PROXY_CLIENT_IP_HEADER = 'X-Proxy-Client-Ip';

// The platform's liveness probe calls the API directly, without the proxy.
// It reveals nothing and touches no database. Exact path, GET/HEAD only:
// readiness and everything else stay behind the secret.
const LIVENESS_PATH = '/api/health';

// Fixed-length digests, so the comparison takes the same time whatever the
// length or content of the header, and timingSafeEqual never throws.
const digest = (value: string): Buffer =>
  createHash('sha256').update(value, 'utf8').digest();

/**
 * Requires the proxy secret (config/proxy-secret.ts) on every request but the
 * liveness probe; `null` turns the check off. Mounted right after the request
 * logger, before rate limits, CORS, body parsing and sessions, so requests
 * that bypass the proxy cost nothing and leave no state.
 *
 * The proxy also sends the client IP it saw. It is believed only together
 * with a valid secret and replaces `req.ip` (used by the per-IP rate limits),
 * because the hops between the proxy and the API (the hosting platform's own
 * load balancers) aren't documented, so no `trust proxy` hop count reliably
 * finds the client's address in `X-Forwarded-For`. `trust proxy` still
 * decides HTTPS detection (`Secure` cookies).
 *
 * Never logs or echoes the header values.
 */
export const requireProxySecret = (secret: string | null): RequestHandler => {
  if (secret === null) {
    return (req, res, next) => next();
  }

  const expected = digest(secret);

  return (req, res, next) => {
    if (
      req.path === LIVENESS_PATH &&
      (req.method === 'GET' || req.method === 'HEAD')
    ) {
      next();
      return;
    }

    // A repeated header arrives joined with ", " and therefore never matches.
    const provided = req.get(PROXY_SECRET_HEADER) ?? '';

    if (!timingSafeEqual(digest(provided), expected)) {
      next(new ForbiddenError('PROXY_REQUIRED'));
      return;
    }

    const clientIp = req.get(PROXY_CLIENT_IP_HEADER)?.trim();

    if (clientIp && isIP(clientIp) !== 0) {
      // An own property shadows Express's `req.ip` getter for this request.
      Object.defineProperty(req, 'ip', {
        value: clientIp,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  };
};
