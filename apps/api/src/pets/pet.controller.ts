import mongoose from 'mongoose';
import type { NextFunction, Request, Response } from 'express';

import { PET_IMAGE_MAX_COUNT } from '@pet-adoption/models';

import {
  addPetImages,
  createPet,
  deleteOwnedPet,
  getPetById,
  isPetOwnedBy,
  listPets,
  listPetsByOwner,
  petExists,
  petImageKeys,
  removePetImageById,
  removePetImages,
  setMainPetImage,
  setPetImage,
  updateOwnedPet,
} from './pet.service';
import { ownerPetsQuerySchema, petListQuerySchema } from './pet.schema';
import { processPetImage, tooManyImagesError } from './pet-image';
import { PetModel } from './pet.model';
import { toPetView } from './pet-view';
import { getAuthenticatedUserId } from '../auth/require-auth';
import { isAdmin } from '../users/user.service';
import { parseInput } from '../middleware/validate';
import { deleteStoredFileQuietly } from '../storage';
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
  const query = parseInput(petListQuerySchema, req.query);
  const page = await listPets(query);

  res.json({ ...page, items: page.items.map(toPetView) });
};

/**
 * GET /api/pets/mine: the signed-in user's own pets, all statuses and hidden
 * ones included. The owner is the session user; nothing in the request can
 * select another user's pets.
 */
export const getMyPetsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = parseInput(ownerPetsQuerySchema, req.query);
  const page = await listPetsByOwner(getAuthenticatedUserId(req), query, 'all');

  res.json({ ...page, items: page.items.map(toPetView) });
};

export const getPetByIdController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const pet = await getPetById(getPetId(req));

  if (!pet || (pet.hiddenAt && !(await canSeeHiddenPet(req, pet)))) {
    throw new NotFoundError('PET_NOT_FOUND');
  }

  res.json(toPetView(pet));
};

/**
 * A hidden listing is visible to its owner (who keeps managing it) and to
 * admins (who moderate it); everyone else gets 404, as if it didn't exist.
 */
const canSeeHiddenPet = async (
  req: Request,
  pet: { owner?: { equals: (id: string) => boolean } },
): Promise<boolean> => {
  const { userId } = req.session;

  if (!userId) {
    return false;
  }

  return Boolean(pet.owner?.equals(userId)) || (await isAdmin(userId));
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
  await Promise.all(petImageKeys(deleted).map(deleteStoredFileQuietly));

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

  // Checked by content and re-encoded; the uploaded bytes are never stored.
  const image = await processPetImage(req.file.buffer);
  const pet = await setPetImage(petId, getAuthenticatedUserId(req), image);

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
  const pet = await removePetImages(petId, getAuthenticatedUserId(req));

  if (!pet) {
    return throwNotOwnedError(petId);
  }

  res.json(toPetView(pet));
};

/**
 * Runs after `requirePetOwner` and before the upload is parsed: a pet that
 * already has the maximum number of photos is refused without reading the
 * files. The service checks the count again, atomically, when adding.
 */
export const requirePetImageCapacity = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const pet = await PetModel.findById(getPetId(req)).select('images').lean();

  if ((pet?.images?.length ?? 0) >= PET_IMAGE_MAX_COUNT) {
    throw tooManyImagesError();
  }

  next();
};

/** Adds 1 to PET_IMAGE_MAX_COUNT photos; all of them or none are stored. */
export const addPetImagesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const petId = getPetId(req);
  const uploaded = Array.isArray(req.files) ? req.files : [];

  if (uploaded.length === 0) {
    throw new BadRequestError('IMAGE_REQUIRED');
  }

  // Every file is checked and re-encoded before any of them is stored. One at
  // a time, so a request decodes at most one image at once.
  const files = [];

  for (const file of uploaded) {
    files.push(await processPetImage(file.buffer));
  }

  const pet = await addPetImages(petId, getAuthenticatedUserId(req), files);

  if (!pet) {
    return throwNotOwnedError(petId);
  }

  res.json(toPetView(pet));
};

export const deletePetImageByIdController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const petId = getPetId(req);
  const { imageId } = req.params;

  if (!mongoose.isValidObjectId(imageId)) {
    throw new NotFoundError('IMAGE_NOT_FOUND');
  }

  const pet = await removePetImageById(
    petId,
    getAuthenticatedUserId(req),
    imageId,
  );

  if (!pet) {
    return throwNotOwnedError(petId);
  }

  res.json(toPetView(pet));
};

/** `POST /api/pets/:id/images/:imageId/main`: makes this photo the main one. */
export const setMainPetImageController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const petId = getPetId(req);
  const { imageId } = req.params;

  if (!mongoose.isValidObjectId(imageId)) {
    throw new NotFoundError('IMAGE_NOT_FOUND');
  }

  const pet = await setMainPetImage(
    petId,
    getAuthenticatedUserId(req),
    imageId,
  );

  if (!pet) {
    return throwNotOwnedError(petId);
  }

  res.json(toPetView(pet));
};
