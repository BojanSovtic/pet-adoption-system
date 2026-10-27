import { Router } from 'express';

import { requireAuth } from '../auth/require-auth';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../middleware/async-handler';
import {
  otherWriteRateLimit,
  petCreateRateLimit,
  photoUploadRateLimit,
} from '../middleware/rate-limit';
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
// requests get 401 regardless of the body), then pass the per-user rate
// limits (429 RATE_LIMITED, see middleware/rate-limit.ts); ownership is
// checked in the service queries.
petRouter.post(
  '/',
  requireAuth,
  petCreateRateLimit,
  validateBody(createPetSchema),
  asyncHandler(createPetController),
);

petRouter.put(
  '/:id',
  requireAuth,
  otherWriteRateLimit,
  validateBody(updatePetSchema),
  asyncHandler(updatePetController),
);

petRouter.delete(
  '/:id',
  requireAuth,
  otherWriteRateLimit,
  asyncHandler(deletePetController),
);

// Single photo (kept for existing clients): PUT replaces all photos with one
// file in the field "image"; DELETE removes all photos. Sign-in, the upload
// rate limit and ownership are checked before the upload is read, so refused
// requests are never buffered or decoded.
petRouter.put(
  '/:id/image',
  requireAuth,
  photoUploadRateLimit,
  asyncHandler(requirePetOwner),
  parsePetImageUpload,
  asyncHandler(uploadPetImageController),
);

petRouter.delete(
  '/:id/image',
  requireAuth,
  otherWriteRateLimit,
  asyncHandler(deletePetImageController),
);

// Photo gallery: POST adds 1-5 files in the field "images" (at most 5 photos
// per pet); DELETE removes one photo by id.
petRouter.post(
  '/:id/images',
  requireAuth,
  photoUploadRateLimit,
  asyncHandler(requirePetOwner),
  asyncHandler(requirePetImageCapacity),
  parsePetImagesUpload,
  asyncHandler(addPetImagesController),
);

petRouter.delete(
  '/:id/images/:imageId',
  requireAuth,
  otherWriteRateLimit,
  asyncHandler(deletePetImageByIdController),
);
