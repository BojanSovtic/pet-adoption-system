import type { Pet, UpdatePetInput } from '@pet-adoption/models';

import { apiClient } from '../../../lib/api-client';

export const updatePet = async (
  id: string,
  input: UpdatePetInput,
): Promise<Pet> => {
  return apiClient<Pet>(`/pets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
};
