import { Router } from 'express';

import { requireAuth } from '../auth/require-auth';
import { asyncHandler } from '../middleware/async-handler';
import {
  getUserPetsController,
  getUserProfileController,
} from './user.controller';

// Mounted at /api/users. Read-only: profiles have no editable fields, and
// there is deliberately no route that changes a user here (any other method
// gets 404 ROUTE_NOT_FOUND). Signed-in users only, so member names are not
// published to anonymous visitors.
export const userRouter: Router = Router();

userRouter.get('/:id', requireAuth, asyncHandler(getUserProfileController));
userRouter.get('/:id/pets', requireAuth, asyncHandler(getUserPetsController));
