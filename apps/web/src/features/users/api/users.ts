import type { Paginated, Pet, PublicUserProfile } from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

type ProfilePetsQuery = { page?: number; pageSize?: number };

/**
 * Profiles are only served to signed-in users, so they are removed on every
 * identity change (see `setCurrentUser`) like other per-user data.
 */
export const userQueryKeys = {
  all: ['users'] as const,
  profile: (id: string) => ['users', 'profile', id] as const,
  pets: (id: string, query: ProfilePetsQuery) =>
    ['users', 'pets', id, query] as const,
};

export const getUserProfile = async (
  id: string,
): Promise<PublicUserProfile> => {
  const { data } = await http.get<PublicUserProfile>(`/users/${id}`);
  return data;
};

export const getUserPets = async (
  id: string,
  query: ProfilePetsQuery,
): Promise<Paginated<Pet>> => {
  const { data } = await http.get<Paginated<Pet>>(`/users/${id}/pets`, {
    params: query,
  });
  return data;
};
