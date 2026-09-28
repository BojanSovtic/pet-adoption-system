import mongoose from 'mongoose';
import type { Request, Response } from 'express';

import type { CreatePetRequest } from './pet.schema';
import { createPet, getPetById, getPets, updatePet } from './pet.service';
import { BadRequestError, NotFoundError } from '../errors/app-error';

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
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new BadRequestError('INVALID_PET_ID');
  }

  const pet = await getPetById(req.params.id);

  if (!pet) {
    throw new NotFoundError('PET_NOT_FOUND');
  }

  res.json(pet);
};

export const createPetController = async (
  req: Request<unknown, unknown, CreatePetRequest>,
  res: Response,
): Promise<void> => {
  const pet = await createPet(req.body);

  res.status(201).json(pet);
};

export const updatePetController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new BadRequestError('INVALID_PET_ID');
  }

  const pet = await updatePet(req.params.id, req.body);

  if (!pet) {
    throw new NotFoundError('PET_NOT_FOUND');
  }

  res.json(pet);
};
