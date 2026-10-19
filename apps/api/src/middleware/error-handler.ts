import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorResponse } from '@pet-adoption/models';

import { AppError } from '../errors/app-error';

// Thrown by express.json() when the request body is not valid JSON.
const isJsonParseError = (error: unknown): boolean =>
  error instanceof SyntaxError &&
  'type' in error &&
  error.type === 'entity.parse.failed';

const toAppError = (error: unknown): AppError | null => {
  if (error instanceof AppError) {
    return error;
  }

  if (isJsonParseError(error)) {
    return new AppError('INVALID_JSON', 400);
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
