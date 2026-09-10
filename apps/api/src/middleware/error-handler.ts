import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/app-error';

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  console.error('[ error ]', error);

  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      code: error.code,
    });

    return;
  }

  res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
  });
};
