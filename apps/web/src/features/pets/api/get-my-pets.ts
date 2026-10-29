import type { Paginated, Pet } from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

export type MyPetsQuery = { page?: number; pageSize?: number };

/** The signed-in user's pets; the API takes the owner from the session. */
export const getMyPets = async (
  query: MyPetsQuery,
): Promise<Paginated<Pet>> => {
  const { data } = await http.get<Paginated<Pet>>('/pets/mine', {
    params: query,
  });
  return data;
};
