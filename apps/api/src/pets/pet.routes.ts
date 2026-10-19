import { Router } from 'express';

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

petRouter.get('/', asyncHandler(getPetsController));
petRouter.get('/:id', asyncHandler(getPetByIdController));

petRouter.post(
  '/',
  validateBody(createPetSchema),
  asyncHandler(createPetController),
);

petRouter.put(
  '/:id',
  validateBody(updatePetSchema),
  asyncHandler(updatePetController),
);

petRouter.delete('/:id', asyncHandler(deletePetController));
