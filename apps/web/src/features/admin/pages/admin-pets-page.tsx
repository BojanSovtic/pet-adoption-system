import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { PawPrint, Search, TriangleAlert } from 'lucide-react';
import {
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
  ADMIN_PET_VISIBILITIES,
  PET_STATUSES,
  type AdminPet,
} from '@pet-adoption/models';

import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StateMessage } from '@/components/state-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { formatDate } from '../../../lib/format-date';
import { getErrorMessage } from '../../../lib/get-error-message';
import { useDebouncedValue } from '../../../lib/use-debounced-value';
import { PetStatusBadge } from '../../pets/components/pet-status-badge';
import {
  adminQueryKeys,
  getAdminPets,
  hidePet,
  restorePet,
} from '../api/admin';
import { ConfirmAction } from '../components/confirm-action';
import {
  readEnum,
  readPage,
  withListChanges,
} from '../utils/admin-list-params';

const SEARCH_DEBOUNCE_MS = 300;

const PetRow = ({ pet }: { pet: AdminPet }) => {
  const { t, i18n } = useTranslation('admin');
  const { t: tPets } = useTranslation('pets');

  return (
    <li className="flex flex-wrap items-start gap-4 py-4">
      <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {pet.imageUrl ? (
          <img
            src={pet.imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <PawPrint
            aria-hidden="true"
            className="m-auto mt-5 size-6 text-muted-foreground"
          />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/pets/${pet._id}`}
            className="font-semibold underline-offset-4 hover:underline"
          >
            {pet.name}
          </Link>
          <PetStatusBadge status={pet.status} />
          {pet.hiddenAt && (
            <Badge variant="destructive">{t('pets.visibility.hidden')}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {[
            tPets(`species.${pet.species}`),
            t('pets.listed', {
              date: formatDate(pet.createdAt, i18n.language),
            }),
            pet.hiddenAt
              ? t('pets.hiddenOn', {
                  date: formatDate(pet.hiddenAt, i18n.language),
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="text-sm break-all">
          <span className="text-muted-foreground">{t('pets.owner')}: </span>
          {pet.ownerDetails
            ? `${pet.ownerDetails.name} (${pet.ownerDetails.email})`
            : t('pets.noOwner')}
        </p>
      </div>
      <div className="w-full sm:w-auto">
        {pet.hiddenAt ? (
          <ConfirmAction
            label={t('pets.restore')}
            accessibleName={`${t('pets.restore')}: ${pet.name}`}
            question={t('pets.confirmRestore', { name: pet.name })}
            confirmLabel={t('pets.confirmRestoreButton')}
            onConfirm={() => restorePet(pet._id)}
            successMessage={t('pets.restored', { name: pet.name })}
          />
        ) : (
          <ConfirmAction
            label={t('pets.hide')}
            accessibleName={`${t('pets.hide')}: ${pet.name}`}
            question={t('pets.confirmHide', { name: pet.name })}
            confirmLabel={t('pets.confirmHideButton')}
            destructive
            withReason
            onConfirm={(reason) => hidePet(pet._id, { reason })}
            successMessage={t('pets.hidden', { name: pet.name })}
          />
        )}
      </div>
    </li>
  );
};

const AdminPetsPage = () => {
  const { t } = useTranslation('admin');
  const { t: tPets } = useTranslation('pets');
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const status = readEnum(searchParams, 'status', PET_STATUSES);
  const visibility = readEnum(
    searchParams,
    'visibility',
    ADMIN_PET_VISIBILITIES,
  );
  const page = readPage(searchParams);

  const update = (changes: Record<string, string | number | undefined>) =>
    setSearchParams((current) => withListChanges(current, changes), {
      replace: true,
    });

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebouncedValue(
    searchInput.trim(),
    SEARCH_DEBOUNCE_MS,
  );

  useEffect(() => {
    if (debouncedSearch !== search) {
      update({ search: debouncedSearch });
    }
    // Only react to the debounced text, not to every URL change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const query = {
    search: search || undefined,
    status,
    visibility,
    page,
    pageSize: ADMIN_LIST_DEFAULT_PAGE_SIZE,
  };

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
    isPlaceholderData,
  } = useQuery({
    queryKey: adminQueryKeys.pets(query),
    queryFn: () => getAdminPets(query),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-6">
      <PageHeader title={t('nav.pets')} description={t('pets.description')} />

      <div
        role="search"
        className="grid gap-3 rounded-lg border bg-card p-3 shadow-card sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]"
      >
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('pets.searchPlaceholder')}
            aria-label={t('pets.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <NativeSelect
          value={status ?? ''}
          onChange={(event) => update({ status: event.target.value })}
          aria-label={t('pets.filterByStatus')}
        >
          <option value="">{t('pets.allStatuses')}</option>
          {PET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {tPets(`status.${value}`)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={visibility ?? ''}
          onChange={(event) => update({ visibility: event.target.value })}
          aria-label={t('pets.filterByVisibility')}
        >
          <option value="">{t('pets.allVisibilities')}</option>
          {ADMIN_PET_VISIBILITIES.map((value) => (
            <option key={value} value={value}>
              {t(`pets.visibility.${value}`)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isPending ? (
        <Card className="gap-4 p-5">
          <p role="status" className="sr-only">
            {t('loading')}
          </p>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </Card>
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
      ) : data.items.length === 0 ? (
        <StateMessage icon={PawPrint} title={t('pets.empty')} />
      ) : (
        <div
          className={cn(
            'space-y-4 transition-opacity',
            isFetching && isPlaceholderData && 'opacity-60',
          )}
          aria-busy={isFetching}
        >
          <p
            className="text-sm font-medium text-muted-foreground"
            aria-live="polite"
          >
            {t('pets.resultCount', { count: data.totalItems })}
          </p>
          <Card className="py-0">
            <ul className="divide-y px-5">
              {data.items.map((pet) => (
                <PetRow key={pet._id} pet={pet} />
              ))}
            </ul>
          </Card>
          <Pagination
            page={page}
            totalPages={data.totalPages}
            onPageChange={(next) => update({ page: next })}
          />
        </div>
      )}
    </section>
  );
};

export { AdminPetsPage };
