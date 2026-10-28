import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@pet-adoption/models';

import { ForbiddenError, UnauthorizedError } from '../errors/app-error';
import { findAuthState } from '../users/user.service';
import { endUserSession } from './session';

/** What `requireAuth` loaded for this request (see `res.locals.auth`). */
type AuthState = { userId: string; role: UserRole };

/**
 * Rejects requests without a usable signed-in user. The user is read from the
 * database on every request (the session only holds the id):
 * - no session → 401 UNAUTHENTICATED;
 * - user deleted → session ended, 401 UNAUTHENTICATED;
 * - user suspended → session ended, 403 ACCOUNT_SUSPENDED. So a suspension
 *   takes effect on the next request, whatever sessions the user holds.
 * This is authentication only; ownership checks live in the services.
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

    const state = await findAuthState(userId);

    if (!state) {
      await endUserSession(req, res);
      throw new UnauthorizedError('UNAUTHENTICATED');
    }

    if (state.suspended) {
      await endUserSession(req, res);
      throw new ForbiddenError('ACCOUNT_SUSPENDED');
    }

    res.locals.auth = { userId, role: state.role } satisfies AuthState;
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

/**
 * Admin-only routes: everything `requireAuth` checks (401, suspension), then
 * 403 ADMIN_REQUIRED unless the user is an admin *now*. The role comes from
 * the same database read as the authentication (never from the session or
 * the client), so a demoted admin loses access on the next request. Mounted
 * on the whole `/api/admin` router, so every admin route is denied by default.
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  await requireAuth(req, res, (authError?: unknown) => {
    if (authError) {
      next(authError);
      return;
    }

    const { role } = res.locals.auth as AuthState;

    next(role === 'admin' ? undefined : new ForbiddenError('ADMIN_REQUIRED'));
  });
};
