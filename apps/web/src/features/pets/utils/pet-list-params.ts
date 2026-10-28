import {
  PET_LIST_DEFAULT_PAGE_SIZE,
  PET_SORT_OPTIONS,
  PET_SPECIES,
  PET_STATUSES,
  type PetSort,
  type PetSpecies,
  type PetStatus,
} from '@pet-adoption/models';

export type PetListParams = {
  search: string;
  species?: PetSpecies;
  status?: PetStatus;
  sort: PetSort;
  page: number;
};

const pick = <T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined => (allowed.includes(value as T) ? (value as T) : undefined);

/**
 * Reads the list state from the URL. Anything invalid (e.g. a hand-edited
 * "?page=abc") falls back to the default instead of producing an API error.
 */
export const parsePetListParams = (
  searchParams: URLSearchParams,
): PetListParams => {
  const page = Number(searchParams.get('page'));

  return {
    search: searchParams.get('search')?.trim() ?? '',
    species: pick(searchParams.get('species'), PET_SPECIES),
    status: pick(searchParams.get('status'), PET_STATUSES),
    sort: pick(searchParams.get('sort'), PET_SORT_OPTIONS) ?? 'newest',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
};

/** Writes the list state to the URL, leaving out defaults to keep it short. */
export const toPetListSearchParams = ({
  search,
  species,
  status,
  sort,
  page,
}: PetListParams): URLSearchParams => {
  const entries: Array<[string, string | undefined]> = [
    ['search', search || undefined],
    ['species', species],
    ['status', status],
    ['sort', sort === 'newest' ? undefined : sort],
    ['page', page > 1 ? String(page) : undefined],
  ];

  return new URLSearchParams(
    entries.filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
};

/** The API query for this state; also used as the TanStack Query key. */
export const toPetListQuery = (params: PetListParams) => ({
  search: params.search || undefined,
  species: params.species,
  status: params.status,
  sort: params.sort,
  page: params.page,
  pageSize: PET_LIST_DEFAULT_PAGE_SIZE,
});

export const hasActiveFilters = ({
  search,
  species,
  status,
}: PetListParams): boolean => Boolean(search || species || status);
