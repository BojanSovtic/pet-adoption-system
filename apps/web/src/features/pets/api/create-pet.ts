import type { CreatePetInput, Pet } from '@pet-adoption/models';

import { apiClient } from '../../../lib/api-client';

export const createPet = async (input: CreatePetInput): Promise<Pet> => {
  return apiClient<Pet>('/pets', {
    method: 'POST',
    body: JSON.stringify(input),
  });
};
