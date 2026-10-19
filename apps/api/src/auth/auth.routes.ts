import { Router } from 'express';

import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/async-handler';
import { loginSchema, registerSchema } from './auth.schema';
import {
  getCurrentUserController,
  loginController,
  logoutController,
  registerController,
} from './auth.controller';

export const authRouter: Router = Router();

authRouter.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(registerController),
);

authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(loginController),
);

authRouter.post('/logout', asyncHandler(logoutController));

authRouter.get('/me', asyncHandler(getCurrentUserController));
