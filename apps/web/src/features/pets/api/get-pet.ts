import type { Pet } from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

export const getPet = async (id: string): Promise<Pet> => {
  const { data } = await http.get<Pet>(`/pets/${id}`);
  return data;
};
