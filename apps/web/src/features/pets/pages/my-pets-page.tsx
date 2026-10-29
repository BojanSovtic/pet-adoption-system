import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { PawPrint, Pencil, Plus, TriangleAlert } from 'lucide-react';
import type { Pet } from '@pet-adoption/models';

import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StateMessage } from '@/components/state-message';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { getErrorMessage } from '../../../lib/get-error-message';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { getMyPets } from '../api/get-my-pets';
import { petQueryKeys } from '../api/pet-query-keys';
import { DeletePetButton } from '../components/delete-pet-button';
import { PetCard, PetCardSkeleton } from '../components/pet-card';

const gridClassName = 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
const SKELETON_COUNT = 4;

const readPage = (searchParams: URLSearchParams): number => {
  const page = Number(searchParams.get('page'));

  return Number.isInteger(page) && page > 0 ? page : 1;
};

const AddPetButton = () => {
  const { t } = useTranslation('pets');

  return (
    <Button asChild>
      <Link to="/pets/new">
        <Plus aria-hidden="true" />
        {t('form.title')}
      </Link>
    </Button>
  );
};

/**
 * One owned pet: the shared card (status badge, link to the details page)
 * plus Edit and Delete. Pending and adopted pets have open or accepted
 * applications, which the API refuses to delete, so Delete is disabled with
 * the reason; the API still decides (it answers 409 if that changed).
 */
const MyPetItem = ({ pet }: { pet: Pet }) => {
  const { t } = useTranslation('pets');
  const canDelete = pet.status === 'available';
  const hintId = `delete-hint-${pet._id}`;

  return (
    <div className="flex h-full flex-col gap-3">
      <PetCard pet={pet} />

      {pet.hidden && (
        <p
          role="note"
          className="rounded-md border border-destructive/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive"
        >
          {t('myPets.hidden')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={`/pets/${pet._id}/edit`}>
            <Pencil aria-hidden="true" />
            {t('myPets.edit')}
            <span className="sr-only">: {pet.name}</span>
          </Link>
        </Button>
        {canDelete ? (
          <DeletePetButton pet={pet} redirectTo={null} size="sm" />
        ) : (
          <Button
            variant="destructive"
            size="sm"
            disabled
            aria-describedby={hintId}
          >
            {t('delete.button')}
          </Button>
        )}
      </div>

      {!canDelete && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {t(`myPets.cannotDelete.${pet.status}`)}
        </p>
      )}
    </div>
  );
};

/**
 * "My pets": every pet the signed-in user owns (adopted and hidden ones too),
 * newest first. The API selects them by the session user, never by an id
 * from the browser.
 */
const MyPetsPage = () => {
  const { t } = useTranslation('pets');
  const location = useLocation();
  const { data: currentUser, isPending: isUserPending } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = readPage(searchParams);
  const query = { page };

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
    isPlaceholderData,
  } = useQuery({
    queryKey: petQueryKeys.minePage(query),
    queryFn: () => getMyPets(query),
    enabled: Boolean(currentUser),
    placeholderData: keepPreviousData,
  });

  const setPage = (next: number) => {
    setSearchParams(next > 1 ? { page: String(next) } : {}, { replace: true });
  };

  if (isUserPending) {
    return (
      <p role="status" className="sr-only">
        {t('myPets.loading')}
      </p>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <section className="space-y-8">
      <PageHeader
        title={t('myPets.title')}
        description={t('myPets.subtitle')}
        actions={<AddPetButton />}
      />

      {isPending ? (
        <div>
          <p role="status" className="sr-only">
            {t('myPets.loading')}
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
          title={getErrorMessage(error, t('myPets.error'))}
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              {t('common:actions.retry')}
            </Button>
          }
        />
      ) : data.totalItems === 0 ? (
        <StateMessage
          icon={PawPrint}
          title={t('myPets.empty')}
          description={t('myPets.emptyHint')}
          action={<AddPetButton />}
        />
      ) : (
        <div
          className={cn(
            'space-y-6 transition-opacity',
            isFetching && isPlaceholderData && 'opacity-60',
          )}
          aria-busy={isFetching}
        >
          <p className="text-sm font-medium text-muted-foreground">
            {t('myPets.count', { count: data.totalItems })}
          </p>

          {data.items.length === 0 ? (
            // A page past the end, e.g. after deleting the last pet on it.
            <StateMessage
              title={t('pageOutOfRange')}
              action={
                <Button variant="outline" onClick={() => setPage(1)}>
                  {t('firstPage')}
                </Button>
              }
            />
          ) : (
            <ul className={gridClassName}>
              {data.items.map((pet) => (
                <li key={pet._id}>
                  <MyPetItem pet={pet} />
                </li>
              ))}
            </ul>
          )}

          <Pagination
            page={page}
            totalPages={data.totalPages}
            onPageChange={setPage}
            label={t('myPets.pagination')}
          />
        </div>
      )}
    </section>
  );
};

export { MyPetsPage };
