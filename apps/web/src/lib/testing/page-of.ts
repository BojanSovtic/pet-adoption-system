import type { Paginated } from '@pet-adoption/models';

/** A one-page API response for mocks; override any field for paging tests. */
export const pageOf = <T>(
  items: T[],
  overrides: Partial<Paginated<T>> = {},
): Paginated<T> => ({
  items,
  page: 1,
  pageSize: 10,
  totalItems: items.length,
  totalPages: items.length > 0 ? 1 : 0,
  ...overrides,
});
