import { Request, Response, NextFunction } from 'express';

import { HttpError } from '@/shared/models/http-error';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let status = 500;
  let message = 'An unknown error occurred!';

  if (err instanceof HttpError) {
    status = err.code;
    message = err.message;
  }
  
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(status).json({
    message: message,
  });
};