import { Router } from 'express';

import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/async-handler';
import { authIpRateLimit, loginRateLimit } from '../middleware/rate-limit';
import { loginSchema, registerSchema } from './auth.schema';
import {
  getCurrentUserController,
  loginController,
  logoutController,
  registerController,
} from './auth.controller';

export const authRouter: Router = Router();

// Rate limits run before validation so malformed floods are counted too.
authRouter.post(
  '/register',
  authIpRateLimit,
  validateBody(registerSchema),
  asyncHandler(registerController),
);

authRouter.post(
  '/login',
  authIpRateLimit,
  loginRateLimit,
  validateBody(loginSchema),
  asyncHandler(loginController),
);

authRouter.post('/logout', asyncHandler(logoutController));

authRouter.get('/me', asyncHandler(getCurrentUserController));
