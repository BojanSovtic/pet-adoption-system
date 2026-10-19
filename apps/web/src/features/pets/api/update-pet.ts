import { apiClient } from '../../../lib/api-client';
import type { Pet } from './get-pets';
import type { CreatePetInput } from './create-pet';

export const updatePet = async (
  id: string,
  input: CreatePetInput,
): Promise<Pet> => {
  return apiClient<Pet>(`/pets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
};
