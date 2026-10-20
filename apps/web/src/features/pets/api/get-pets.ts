import type { Paginated, Pet, PetListQuery } from '@pet-adoption/models';

import { apiClient } from '../../../lib/api-client';

export const getPets = async (query: PetListQuery): Promise<Paginated<Pet>> => {
  return apiClient<Paginated<Pet>>('/pets', { searchParams: query });
};
