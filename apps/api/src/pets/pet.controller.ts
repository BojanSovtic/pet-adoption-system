import mongoose from 'mongoose';
import type { Request, Response } from 'express';

import {
  createPet,
  deleteOwnedPet,
  getPetById,
  getPets,
  petExists,
  updateOwnedPet,
} from './pet.service';
import { getAuthenticatedUserId } from '../auth/require-auth';
import {
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

export const getPetsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const pets = await getPets();

  res.json(pets);
};

export const getPetByIdController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const pet = await getPetById(getPetId(req));

  if (!pet) {
    throw new NotFoundError('PET_NOT_FOUND');
  }

  res.json(pet);
};

export const createPetController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // The owner always comes from the session, never from the request body.
  const pet = await createPet(req.body, getAuthenticatedUserId(req));

  res.status(201).json(pet);
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

  res.json(pet);
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

  res.status(204).end();
};
