import { Router } from 'express';

import { requireAuth } from '../auth/require-auth';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/async-handler';
import { createPetSchema, updatePetSchema } from './pet.schema';
import {
  createPetController,
  deletePetController,
  getPetByIdController,
  getPetsController,
  updatePetController,
} from './pet.controller';

export const petRouter: Router = Router();

// Browsing is public.
petRouter.get('/', asyncHandler(getPetsController));
petRouter.get('/:id', asyncHandler(getPetByIdController));

// Changes require a signed-in user (checked before validation, so anonymous
// requests get 401 regardless of the body); ownership is checked in the
// service queries.
petRouter.post(
  '/',
  requireAuth,
  validateBody(createPetSchema),
  asyncHandler(createPetController),
);

petRouter.put(
  '/:id',
  requireAuth,
  validateBody(updatePetSchema),
  asyncHandler(updatePetController),
);

petRouter.delete('/:id', requireAuth, asyncHandler(deletePetController));
