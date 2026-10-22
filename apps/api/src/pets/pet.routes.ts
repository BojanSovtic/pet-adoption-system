import { Router } from 'express';

import { requireAuth } from '../auth/require-auth';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/async-handler';
import { createPetSchema, updatePetSchema } from './pet.schema';
import { parsePetImagesUpload, parsePetImageUpload } from './pet-image';
import {
  addPetImagesController,
  createPetController,
  deletePetController,
  deletePetImageByIdController,
  deletePetImageController,
  getPetByIdController,
  getPetsController,
  requirePetImageCapacity,
  requirePetOwner,
  updatePetController,
  uploadPetImageController,
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

// Single photo (kept for existing clients): PUT replaces all photos with one
// file in the field "image"; DELETE removes all photos. Sign-in and ownership
// are checked before the upload is read.
petRouter.put(
  '/:id/image',
  requireAuth,
  asyncHandler(requirePetOwner),
  parsePetImageUpload,
  asyncHandler(uploadPetImageController),
);

petRouter.delete(
  '/:id/image',
  requireAuth,
  asyncHandler(deletePetImageController),
);

// Photo gallery: POST adds 1-5 files in the field "images" (at most 5 photos
// per pet); DELETE removes one photo by id.
petRouter.post(
  '/:id/images',
  requireAuth,
  asyncHandler(requirePetOwner),
  asyncHandler(requirePetImageCapacity),
  parsePetImagesUpload,
  asyncHandler(addPetImagesController),
);

petRouter.delete(
  '/:id/images/:imageId',
  requireAuth,
  asyncHandler(deletePetImageByIdController),
);
