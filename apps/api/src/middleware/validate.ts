import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { ValidationError } from '../errors/app-error';

/**
 * Parses `data` with `schema`, or throws a `ValidationError` (400
 * VALIDATION_FAILED with field details). Used for bodies and query strings.
 */
export const parseInput = <T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.output<T> => {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        code: issue.code,
      })),
    );
  }

  return result.data;
};

export const validateBody = (schema: z.ZodType) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = parseInput(schema, req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
};
