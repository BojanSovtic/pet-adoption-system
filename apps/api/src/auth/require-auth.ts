import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '../errors/app-error';
import { userExists } from '../users/user.service';
import { endUserSession } from './session';

/**
 * Rejects requests without a signed-in user (401 UNAUTHENTICATED). Sessions
 * whose user was deleted are destroyed, so data can't be created for a
 * missing account. This is authentication only; ownership checks live in the
 * services.
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { userId } = req.session;

    if (!userId) {
      throw new UnauthorizedError('UNAUTHENTICATED');
    }

    if (!(await userExists(userId))) {
      await endUserSession(req, res);
      throw new UnauthorizedError('UNAUTHENTICATED');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/** The signed-in user's id. Use in handlers behind `requireAuth`. */
export const getAuthenticatedUserId = (req: Request): string => {
  const { userId } = req.session;

  if (!userId) {
    throw new UnauthorizedError('UNAUTHENTICATED');
  }

  return userId;
};
