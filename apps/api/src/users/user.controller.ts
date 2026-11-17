import mongoose from 'mongoose';
import type { Request, Response } from 'express';

import { BadRequestError, NotFoundError } from '../errors/app-error';
import { parseInput } from '../middleware/validate';
import { ownerPetsQuerySchema } from '../pets/pet.schema';
import { listPetsByOwner } from '../pets/pet.service';
import { toPetView } from '../pets/pet-view';
import { findPublicProfile } from './user.service';

const getUserId = (req: Request): string => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new BadRequestError('INVALID_USER_ID');
  }

  return req.params.id;
};

/** GET /api/users/:id: the public profile (name and member-since date only). */
export const getUserProfileController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const profile = await findPublicProfile(getUserId(req));

  if (!profile) {
    throw new NotFoundError('USER_NOT_FOUND');
  }

  res.json(profile);
};

/** GET /api/users/:id/pets: the user's listed pets (not hidden, not adopted). */
export const getUserPetsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getUserId(req);
  const query = parseInput(ownerPetsQuerySchema, req.query);

  if (!(await findPublicProfile(userId))) {
    throw new NotFoundError('USER_NOT_FOUND');
  }

  const page = await listPetsByOwner(userId, query, 'listed');

  res.json({ ...page, items: page.items.map(toPetView) });
};
