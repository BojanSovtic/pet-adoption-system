import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorResponse } from '@pet-adoption/models';

import { AppError } from '../errors/app-error';

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
    next(error);
    return;
  }

  const appError = toAppError(error);

  if (!appError) {
    // Only unexpected errors are logged; expected 4xx errors are normal traffic.
    console.error('[ error ]', error);

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
