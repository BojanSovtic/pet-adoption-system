import type { CreatePetInput, UpdatePetInput } from '@pet-adoption/models';

import { PetModel, type PetRecord } from './pet.model';

export const getPets = async (): Promise<PetRecord[]> => {
  return PetModel.find().sort({ createdAt: -1 }).lean();
};

export const getPetById = async (id: string): Promise<PetRecord | null> => {
  return PetModel.findById(id).lean();
};

export const petExists = async (id: string): Promise<boolean> => {
  return (await PetModel.exists({ _id: id })) !== null;
};

export const createPet = async (
  input: CreatePetInput,
  ownerId: string,
): Promise<PetRecord> => {
  // `owner` comes last so nothing in the input can override it.
  const pet = await PetModel.create({ ...input, owner: ownerId });

  return pet.toObject();
};

/**
 * Updates the pet only if `ownerId` owns it; the ownership check is part of
 * the query, so it cannot race. Returns `null` if no owned pet matched.
 */
export const updateOwnedPet = async (
  id: string,
  ownerId: string,
  input: UpdatePetInput,
): Promise<PetRecord | null> => {
  return PetModel.findOneAndUpdate({ _id: id, owner: ownerId }, input, {
    returnDocument: 'after',
    runValidators: true,
  }).lean();
};

/** Deletes the pet only if `ownerId` owns it. Returns `false` otherwise. */
export const deleteOwnedPet = async (
  id: string,
  ownerId: string,
): Promise<boolean> => {
  const pet = await PetModel.findOneAndDelete({
    _id: id,
    owner: ownerId,
  }).lean();

  return pet !== null;
};
