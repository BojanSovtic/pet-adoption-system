import type { CreatePetInput, UpdatePetInput } from '@pet-adoption/models';

import { PetModel, type PetRecord } from './pet.model';

export const getPets = async (): Promise<PetRecord[]> => {
  return PetModel.find().sort({ createdAt: -1 }).lean();
};

export const getPetById = async (id: string): Promise<PetRecord | null> => {
  return PetModel.findById(id).lean();
};

export const createPet = async (input: CreatePetInput): Promise<PetRecord> => {
  const pet = await PetModel.create(input);

  return pet.toObject();
};

export const updatePet = async (
  id: string,
  input: UpdatePetInput,
): Promise<PetRecord | null> => {
  return PetModel.findByIdAndUpdate(id, input, {
    returnDocument: 'after',
    runValidators: true,
  }).lean();
};

export const deletePet = async (id: string): Promise<boolean> => {
  const pet = await PetModel.findByIdAndDelete(id).lean();

  return pet !== null;
};
