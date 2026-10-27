import type { Request, Response } from 'express';
import type { LoginInput, RegisterInput } from '@pet-adoption/models';

import { UnauthorizedError } from '../errors/app-error';
import { findUserById, toPublicUser } from '../users/user.service';
import { authenticateWithPassword, registerWithPassword } from './auth.service';
import { endUserSession, startUserSession } from './session';

export const registerController = async (
  req: Request<unknown, unknown, RegisterInput>,
  res: Response,
): Promise<void> => {
  const user = await registerWithPassword(req.body);

  // Registration signs the user in.
  await startUserSession(req, user._id.toString());

  res.status(201).json(toPublicUser(user));
};

export const loginController = async (
  req: Request<unknown, unknown, LoginInput>,
  res: Response,
): Promise<void> => {
  const user = await authenticateWithPassword(req.body);

  await startUserSession(req, user._id.toString());

  res.json(toPublicUser(user));
};

export const logoutController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // Idempotent: logging out without a session still succeeds.
  await endUserSession(req, res);

  res.status(204).end();
};

export const getCurrentUserController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { userId } = req.session;

  if (!userId) {
    throw new UnauthorizedError('UNAUTHENTICATED');
  }

  const user = await findUserById(userId);

  if (!user || user.suspendedAt) {
    // Deleted or suspended while signed in: end the session, so the web
    // shows the user as signed out (sign-in then explains a suspension).
    await endUserSession(req, res);
    throw new UnauthorizedError('UNAUTHENTICATED');
  }

  res.json(toPublicUser(user));
};
