import { apiClient } from '../../../lib/api-client';

import type { Pet } from './get-pets';

export const getPet = async (id: string): Promise<Pet> => {
  return apiClient<Pet>(`/pets/${id}`);
};
