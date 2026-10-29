import type { PetListQuery } from '@pet-adoption/models';

import type { MyPetsQuery } from './get-my-pets';

/**
 * Query keys for pets. Every list parameter is part of the list key, so two
 * different searches or pages never share a cache entry. Invalidating `all`
 * refreshes every list and detail. "My pets" pages sit under `lists()`, so
 * every list update (e.g. after a delete) covers them too; they belong to the
 * signed-in user and are removed on identity changes (`setCurrentUser`).
 */
export const petQueryKeys = {
  all: ['pets'] as const,
  lists: () => ['pets', 'list'] as const,
  list: (query: PetListQuery) => ['pets', 'list', query] as const,
  mine: () => ['pets', 'list', 'mine'] as const,
  minePage: (query: MyPetsQuery) => ['pets', 'list', 'mine', query] as const,
  detail: (id: string) => ['pets', 'detail', id] as const,
};
