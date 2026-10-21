import type { Pet, UpdatePetInput } from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

export const updatePet = async (
  id: string,
  input: UpdatePetInput,
): Promise<Pet> => {
  const { data } = await http.put<Pet>(`/pets/${id}`, input);
  return data;
};
