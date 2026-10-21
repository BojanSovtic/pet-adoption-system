import type { Paginated, Pet, PetListQuery } from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

// Axios leaves `undefined` params out of the query string.
export const getPets = async (query: PetListQuery): Promise<Paginated<Pet>> => {
  const { data } = await http.get<Paginated<Pet>>('/pets', { params: query });
  return data;
};
