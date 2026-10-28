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

import { PawPrint, Plus, Search, SearchX, TriangleAlert } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StateMessage } from '@/components/state-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

import { getErrorMessage } from '../../../lib/get-error-message';
import { useDebouncedValue } from '../../../lib/use-debounced-value';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { getPets } from '../api/get-pets';
import { petQueryKeys } from '../api/pet-query-keys';
import { PetCard, PetCardSkeleton } from '../components/pet-card';
import { isPetOwner } from '../utils/is-pet-owner';
import {
  hasActiveFilters,
  parsePetListParams,
  toPetListQuery,
  toPetListSearchParams,
  type PetListParams,
} from '../utils/pet-list-params';

const SEARCH_DEBOUNCE_MS = 300;

// Placeholder cards while the first page loads.
const SKELETON_COUNT = 8;

// 1 column on phones, up to 4 on wide screens (12 per page divides evenly by 2, 3 and 4).
const gridClassName = 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

const PetsPage = () => {
  const { t } = useTranslation('pets');
  // One cached query for the whole list; undefined while loading, so no
  // card is marked as yours until the session is known.
  const { data: currentUser } = useCurrentUser();

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

  const {
    data,
    isPending,
    isError,
    error,
    isFetching,
    isPlaceholderData,
    refetch,
  } = useQuery({
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

  const filtersActive = hasActiveFilters(params);

  return (
    <section className="space-y-8">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button asChild>
            <Link to="/pets/new">
              <Plus aria-hidden="true" />
              {t('form.title')}
            </Link>
          </Button>
        }
      />

      <div
        role="search"
        className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-3 shadow-card md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(10rem,auto))]"
      >
        <div className="relative col-span-2 md:col-span-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="pl-9"
          />
        </div>

        <NativeSelect
          value={params.species ?? ''}
          onChange={(event) =>
            updateParams({
              species: (event.target.value || undefined) as
                PetSpecies | undefined,
            })
          }
          aria-label={t('filterBySpecies')}
        >
          <option value="">{t('speciesFilter.all')}</option>
          {PET_SPECIES.map((value) => (
            <option key={value} value={value}>
              {t(`species.${value}`)}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          value={params.status ?? ''}
          onChange={(event) =>
            updateParams({
              status: (event.target.value || undefined) as
                PetStatus | undefined,
            })
          }
          aria-label={t('filterByStatus')}
        >
          <option value="">{t('statusFilter.all')}</option>
          {PET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`status.${value}`)}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          value={params.sort}
          onChange={(event) =>
            updateParams({ sort: event.target.value as PetSort })
          }
          aria-label={t('sortBy')}
          containerClassName="col-span-2 md:col-span-1"
        >
          {PET_SORT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`sort.${value}`)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isPending ? (
        <div>
          <p role="status" className="sr-only">
            {t('loading')}
          </p>
          <ul className={gridClassName}>
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <li key={index}>
                <PetCardSkeleton />
              </li>
            ))}
          </ul>
        </div>
      ) : isError ? (
        <StateMessage
          tone="error"
          icon={TriangleAlert}
          title={getErrorMessage(error, t('error'))}
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              {t('common:actions.retry')}
            </Button>
          }
        />
      ) : data.totalItems === 0 ? (
        <StateMessage
          icon={filtersActive ? SearchX : PawPrint}
          title={filtersActive ? t('noMatchingPets') : t('empty')}
          description={filtersActive ? t('noMatchingPetsHint') : t('emptyHint')}
          action={
            filtersActive && (
              <Button variant="outline" onClick={clearFilters}>
                {t('clearFilters')}
              </Button>
            )
          }
        />
      ) : (
        <div
          className={cn(
            'space-y-6 transition-opacity',
            isFetching && isPlaceholderData && 'opacity-60',
          )}
          aria-busy={isFetching}
        >
          <p
            className="text-sm font-medium text-muted-foreground"
            aria-live="polite"
          >
            {t('resultCount', { count: data.totalItems })}
          </p>

          {data.items.length === 0 ? (
            // A page number past the end, e.g. from an old link.
            <StateMessage
              title={t('pageOutOfRange')}
              action={
                <Button
                  variant="outline"
                  onClick={() => updateParams({ page: 1 })}
                >
                  {t('firstPage')}
                </Button>
              }
            />
          ) : (
            <ul className={gridClassName}>
              {data.items.map((pet) => (
                <li key={pet._id}>
                  <PetCard pet={pet} isOwn={isPetOwner(pet, currentUser)} />
                </li>
              ))}
            </ul>
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
