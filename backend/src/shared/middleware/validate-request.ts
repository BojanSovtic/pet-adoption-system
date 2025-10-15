import { Request, Response, NextFunction } from 'express';
import { ValidationError, validationResult } from 'express-validator';

export const  validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  return res.status(422).json({
    message: 'Validation failed',
    errors: errors.array().map((error: ValidationError) => ({ type: error.type, msg: error.msg })),
  });
}