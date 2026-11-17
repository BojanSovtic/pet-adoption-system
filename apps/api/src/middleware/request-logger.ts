import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';

import { logger, type LogFields } from '../logging/logger';
import { runWithRequestContext } from '../logging/request-context';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Gives every request a server-generated id (random UUID), returns it in
 * `X-Request-Id`, makes it available to later code (`res.locals.requestId`,
 * and the logger through the request context), and logs one line when the
 * response is finished or the client goes away.
 *
 * A client-sent X-Request-Id is ignored: it's neither trusted nor echoed.
 *
 * Only chosen fields are logged: method, path without the query string,
 * status, duration and, when signed in, the user id. Never the query
 * (search text, filters), headers, cookies, bodies or the client IP.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();
  let logged = false;

  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const logOnce = (aborted: boolean) => {
    if (logged) {
      return;
    }

    logged = true;
    const fields = requestFields(req, res, requestId, startedAt);

    if (aborted) {
      logger.warn('request aborted', fields);
    } else if (res.statusCode >= 500) {
      logger.error('request completed', fields);
    } else if (isRoutine(req, res)) {
      logger.debug('request completed', fields);
    } else {
      logger.info('request completed', fields);
    }
  };

  res.on('finish', () => logOnce(false));
  // 'close' without 'finish': the connection ended before the response did.
  res.on('close', () => logOnce(!res.writableFinished));

  runWithRequestContext({ requestId }, () => next());
};

const pathOf = (req: Request): string => req.originalUrl.split('?')[0];

const requestFields = (
  req: Request,
  res: Response,
  requestId: string,
  startedAt: bigint,
): LogFields => {
  const durationMs =
    Number((process.hrtime.bigint() - startedAt) / 1000n) / 1000;
  const userId = (res.locals.auth as { userId?: string } | undefined)?.userId;

  return {
    requestId,
    method: req.method,
    path: pathOf(req),
    status: res.statusCode,
    durationMs,
    ...(userId ? { userId } : {}),
  };
};

/**
 * Health probes and photo downloads that succeed are frequent and say
 * little, so they are logged at debug level; their failures are not.
 */
const isRoutine = (req: Request, res: Response): boolean => {
  if (res.statusCode >= 400) {
    return false;
  }

  const path = pathOf(req);

  return (
    path === '/api/health' ||
    path === '/api/ready' ||
    path.startsWith('/uploads/')
  );
};
