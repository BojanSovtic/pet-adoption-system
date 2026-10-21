import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import {
  PET_SORT_OPTIONS,
  PET_SPECIES,
  PET_STATUSES,
  type PetSort,
  type PetSpecies,
  type PetStatus,
} from '@pet-adoption/models';

import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';

import { getErrorMessage } from '../../../lib/get-error-message';
import { useDebouncedValue } from '../../../lib/use-debounced-value';
import { getPets } from '../api/get-pets';
import { petQueryKeys } from '../api/pet-query-keys';
import { PetCard } from '../components/pet-card';
import {
  hasActiveFilters,
  parsePetListParams,
  toPetListQuery,
  toPetListSearchParams,
  type PetListParams,
} from '../utils/pet-list-params';

const SEARCH_DEBOUNCE_MS = 300;

const controlClassName =
  'h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const PetsPage = () => {
  const { t } = useTranslation('pets');

  // The URL holds the list state, so back/forward and shared links restore
  // the same search, filters and page.
  const [searchParams, setSearchParams] = useSearchParams();
  const params = parsePetListParams(searchParams);

  const updateParams = (changes: Partial<PetListParams>) => {
    // Any change other than the page itself starts again at page 1.
    const next = { ...params, page: 1, ...changes };
    setSearchParams(toPetListSearchParams(next), { replace: true });
  };

  // The input updates on every keystroke; the URL (and the request) only
  // after the user pauses typing.
  const [searchInput, setSearchInput] = useState(params.search);
  const debouncedSearch = useDebouncedValue(
    searchInput.trim(),
    SEARCH_DEBOUNCE_MS,
  );

  useEffect(() => {
    if (debouncedSearch !== params.search) {
      updateParams({ search: debouncedSearch });
    }
    // Only react to the debounced text, not to every URL change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const query = toPetListQuery(params);

  const { data, isPending, isError, error, isFetching, isPlaceholderData } =
    useQuery({
      queryKey: petQueryKeys.list(query),
      queryFn: () => getPets(query),
      // Keep showing the previous page while the next one loads.
      placeholderData: keepPreviousData,
    });

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams(
      toPetListSearchParams({ search: '', sort: params.sort, page: 1 }),
      { replace: true },
    );
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>

        <Link
          to="/pets/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t('form.title')}
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className={`${controlClassName} min-w-0 flex-1`}
        />

        <select
          value={params.species ?? ''}
          onChange={(event) =>
            updateParams({
              species: (event.target.value || undefined) as
                PetSpecies | undefined,
            })
          }
          aria-label={t('filterBySpecies')}
          className={controlClassName}
        >
          <option value="">{t('speciesFilter.all')}</option>
          {PET_SPECIES.map((value) => (
            <option key={value} value={value}>
              {t(`species.${value}`)}
            </option>
          ))}
        </select>

        <select
          value={params.status ?? ''}
          onChange={(event) =>
            updateParams({
              status: (event.target.value || undefined) as
                PetStatus | undefined,
            })
          }
          aria-label={t('filterByStatus')}
          className={controlClassName}
        >
          <option value="">{t('statusFilter.all')}</option>
          {PET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`status.${value}`)}
            </option>
          ))}
        </select>

        <select
          value={params.sort}
          onChange={(event) =>
            updateParams({ sort: event.target.value as PetSort })
          }
          aria-label={t('sortBy')}
          className={controlClassName}
        >
          {PET_SORT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`sort.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
        <p>{t('loading')}</p>
      ) : isError ? (
        <p>{getErrorMessage(error, t('error'))}</p>
      ) : data.totalItems === 0 ? (
        <div className="space-y-3">
          <p className="text-muted-foreground">
            {hasActiveFilters(params) ? t('noMatchingPets') : t('empty')}
          </p>
          {hasActiveFilters(params) && (
            <Button variant="outline" onClick={clearFilters}>
              {t('clearFilters')}
            </Button>
          )}
        </div>
      ) : (
        <div
          className={`space-y-6 transition-opacity ${isFetching && isPlaceholderData ? 'opacity-60' : ''}`}
          aria-busy={isFetching}
        >
          <p className="text-sm text-muted-foreground">
            {t('resultCount', { count: data.totalItems })}
          </p>

          {data.items.length === 0 ? (
            // A page number past the end, e.g. from an old link.
            <div className="space-y-3">
              <p className="text-muted-foreground">{t('pageOutOfRange')}</p>
              <Button
                variant="outline"
                onClick={() => updateParams({ page: 1 })}
              >
                {t('firstPage')}
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((pet) => (
                <PetCard key={pet._id} pet={pet} />
              ))}
            </div>
          )}

          <Pagination
            page={params.page}
            totalPages={data.totalPages}
            onPageChange={(page) => updateParams({ page })}
          />
        </div>
      )}
    </section>
  );
};

export { PetsPage };
