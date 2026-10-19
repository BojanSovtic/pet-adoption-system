import type { Pet } from '@pet-adoption/models';

import { apiClient } from '../../../lib/api-client';

export const getPet = async (id: string): Promise<Pet> => {
  return apiClient<Pet>(`/pets/${id}`);
};
