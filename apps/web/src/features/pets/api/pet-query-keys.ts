import type { PetListQuery } from '@pet-adoption/models';

/**
 * Query keys for pets. Every list parameter is part of the list key, so two
 * different searches or pages never share a cache entry. Invalidating `all`
 * refreshes every list and detail.
 */
export const petQueryKeys = {
  all: ['pets'] as const,
  lists: () => ['pets', 'list'] as const,
  list: (query: PetListQuery) => ['pets', 'list', query] as const,
  detail: (id: string) => ['pets', 'detail', id] as const,
};
