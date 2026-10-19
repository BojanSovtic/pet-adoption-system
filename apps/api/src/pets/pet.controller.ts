import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import type { CreatePetInput } from '@pet-adoption/models';

import {
  createPet,
  deletePet,
  getPetById,
  getPets,
  updatePet,
} from './pet.service';
import { BadRequestError, NotFoundError } from '../errors/app-error';

const getPetId = (req: Request): string => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new BadRequestError('INVALID_PET_ID');
  }

  return req.params.id;
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
  req: Request<unknown, unknown, CreatePetInput>,
  res: Response,
): Promise<void> => {
  const pet = await createPet(req.body);

  res.status(201).json(pet);
};

export const updatePetController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const pet = await updatePet(getPetId(req), req.body);

  if (!pet) {
    throw new NotFoundError('PET_NOT_FOUND');
  }

  res.json(pet);
};

export const deletePetController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const deleted = await deletePet(getPetId(req));

  if (!deleted) {
    throw new NotFoundError('PET_NOT_FOUND');
  }

  res.status(204).end();
};
