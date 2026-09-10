import type { Request, Response } from 'express';

import type { CreatePetRequest } from './pet.schema';
import { createPet } from './pet.service';

export const createPetController = async (
  req: Request<unknown, unknown, CreatePetRequest>,
  res: Response,
): Promise<void> => {
  const pet = await createPet(req.body);

  res.status(201).json(pet);
};
