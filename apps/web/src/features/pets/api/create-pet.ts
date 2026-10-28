import type { CreatePetInput, Pet } from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

export const createPet = async (input: CreatePetInput): Promise<Pet> => {
  const { data } = await http.post<Pet>('/pets', input);
  return data;
};
