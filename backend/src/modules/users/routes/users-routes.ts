import { Router } from 'express';
import { body } from 'express-validator';
import asyncHandler from 'express-async-handler';

import { validateRequest } from '@/shared/middleware/validate-request';
import * as usersController from '@/modules/users/controllers/users-controller';

const router = Router();

router.get(
  '/',
  asyncHandler(usersController.getUsers)
);

router.post(
  '/signup',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email')
      .normalizeEmail({ gmail_remove_dots: false })
      .isEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  ],
  validateRequest,
  asyncHandler(usersController.signup)
);

router.post(
  '/login',
  [
    body('email').normalizeEmail().isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  asyncHandler(usersController.login)
);

export default router;
