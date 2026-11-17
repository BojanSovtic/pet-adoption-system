import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorResponse } from '@pet-adoption/models';

import { AppError } from '../errors/app-error';
import { logger, serializeError } from '../logging/logger';

// Method and path without the query string; the request id comes from the
// request context. Never the body, headers or query.
const errorFields = (req: Request, error: unknown) => ({
  method: req.method,
  path: req.originalUrl.split('?')[0],
  err: serializeError(error),
});

/**
 * Client errors raised by express.json() (body-parser), keyed by their `type`.
 * Anything else it raises (e.g. `stream.encoding.set`) is a server bug and
 * stays a logged 500.
 */
const BODY_PARSER_ERRORS = new Map<string, { code: string; status: number }>([
  ['entity.parse.failed', { code: 'INVALID_JSON', status: 400 }],
  ['entity.too.large', { code: 'PAYLOAD_TOO_LARGE', status: 413 }],
  ['request.aborted', { code: 'INVALID_REQUEST_BODY', status: 400 }],
  ['request.size.invalid', { code: 'INVALID_REQUEST_BODY', status: 400 }],
  ['encoding.unsupported', { code: 'UNSUPPORTED_ENCODING', status: 415 }],
  ['charset.unsupported', { code: 'UNSUPPORTED_ENCODING', status: 415 }],
]);

const getBodyParserError = (error: unknown) =>
  error instanceof Error && 'type' in error && typeof error.type === 'string'
    ? BODY_PARSER_ERRORS.get(error.type)
    : undefined;

const toAppError = (error: unknown): AppError | null => {
  if (error instanceof AppError) {
    return error;
  }

  const bodyParserError = getBodyParserError(error);

  if (bodyParserError) {
    return new AppError(bodyParserError.code, bodyParserError.status);
  }

  return null;
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (res.headersSent) {
    // Too late for an error response; Express closes the connection.
    logger.error('error after the response started', errorFields(req, error));
    next(error);
    return;
  }

  const appError = toAppError(error);

  if (!appError) {
    // Only unexpected errors are logged; expected 4xx errors are normal
    // traffic (the request log line has their status). The stack stays in
    // the server log; the client gets only the code and the X-Request-Id.
    logger.error('unexpected error', errorFields(req, error));

    res
      .status(500)
      .json({ code: 'INTERNAL_SERVER_ERROR' } satisfies ApiErrorResponse);

    return;
  }

  const body: ApiErrorResponse = { code: appError.code };

  if (appError.details) {
    body.details = appError.details;
  }

  res.status(appError.statusCode).json(body);
};
