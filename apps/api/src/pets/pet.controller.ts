import mongoose from 'mongoose';
import type { NextFunction, Request, Response } from 'express';

import {
  createPet,
  deleteOwnedPet,
  getPetById,
  isPetOwnedBy,
  listPets,
  petExists,
  removePetImage,
  setPetImage,
  updateOwnedPet,
} from './pet.service';
import { petListQuerySchema } from './pet.schema';
import { detectImageType } from './pet-image';
import type { PetRecord } from './pet.model';
import { getAuthenticatedUserId } from '../auth/require-auth';
import { parseInput } from '../middleware/validate';
import { deleteStoredFileQuietly, storage } from '../storage';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../errors/app-error';

const getPetId = (req: Request): string => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new BadRequestError('INVALID_PET_ID');
  }

  return req.params.id;
};

/**
 * Called when an owner-scoped query matched nothing. Pets are public, so
 * telling "not yours" apart from "doesn't exist" reveals nothing private.
 */
const throwNotOwnedError = async (petId: string): Promise<never> => {
  if (await petExists(petId)) {
    throw new ForbiddenError('NOT_PET_OWNER');
  }

  throw new NotFoundError('PET_NOT_FOUND');
};

/** The API shape of a pet: the storage key becomes a public `imageUrl`. */
const toPetView = ({ imageKey, ...pet }: PetRecord) => ({
  ...pet,
  imageUrl: imageKey ? storage.publicUrl(imageKey) : null,
});

export const getPetsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = parseInput(petListQuerySchema, req.query);
  const page = await listPets(query);

  res.json({ ...page, items: page.items.map(toPetView) });
};

export const getPetByIdController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const pet = await getPetById(getPetId(req));

  if (!pet) {
    throw new NotFoundError('PET_NOT_FOUND');
  }

  res.json(toPetView(pet));
};

export const createPetController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // The owner always comes from the session, never from the request body.
  const pet = await createPet(req.body, getAuthenticatedUserId(req));

  res.status(201).json(toPetView(pet));
};

export const updatePetController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const petId = getPetId(req);
  const pet = await updateOwnedPet(
    petId,
    getAuthenticatedUserId(req),
    req.body,
  );

  if (!pet) {
    return throwNotOwnedError(petId);
  }

  res.json(toPetView(pet));
};

export const deletePetController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const petId = getPetId(req);
  const deleted = await deleteOwnedPet(petId, getAuthenticatedUserId(req));

  if (!deleted) {
    return throwNotOwnedError(petId);
  }

  // After the transaction: a file can't be "un-deleted" if it rolled back.
  if (deleted.imageKey) {
    await deleteStoredFileQuietly(deleted.imageKey);
  }

  res.status(204).end();
};

/**
 * Runs before the upload is parsed, so a non-owner's request is rejected
 * without reading (up to 5 MB of) the file. The service checks ownership
 * again in its update query.
 */
export const requirePetOwner = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const petId = getPetId(req);

  if (!(await petExists(petId))) {
    throw new NotFoundError('PET_NOT_FOUND');
  }

  if (!(await isPetOwnedBy(petId, getAuthenticatedUserId(req)))) {
    throw new ForbiddenError('NOT_PET_OWNER');
  }

  next();
};

export const uploadPetImageController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const petId = getPetId(req);

  if (!req.file) {
    throw new BadRequestError('IMAGE_REQUIRED');
  }

  // Decided by the file's content, not by its name or declared type.
  const type = detectImageType(req.file.buffer);

  if (!type) {
    throw new AppError('UNSUPPORTED_IMAGE_TYPE', 415);
  }

  const pet = await setPetImage(petId, getAuthenticatedUserId(req), {
    data: req.file.buffer,
    type,
  });

  if (!pet) {
    return throwNotOwnedError(petId);
  }

  res.json(toPetView(pet));
};

export const deletePetImageController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const petId = getPetId(req);
  const pet = await removePetImage(petId, getAuthenticatedUserId(req));

  if (!pet) {
    return throwNotOwnedError(petId);
  }

  res.json(toPetView(pet));
};
