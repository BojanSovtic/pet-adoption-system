import type { Pet } from '@pet-adoption/models';

import { apiClient } from '../../../lib/api-client';

export const getPets = async (): Promise<Pet[]> => {
  return apiClient<Pet[]>('/pets');
};
