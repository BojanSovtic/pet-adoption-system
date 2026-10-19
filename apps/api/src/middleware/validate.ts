import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { ValidationError } from '../errors/app-error';

export const validateBody = (schema: z.ZodType) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(
        new ValidationError(
          result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            code: issue.code,
          })),
        ),
      );

      return;
    }

    req.body = result.data;
    next();
  };
};
