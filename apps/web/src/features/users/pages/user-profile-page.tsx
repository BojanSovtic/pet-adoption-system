import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Link,
  Navigate,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { PawPrint, SearchX, TriangleAlert, UserRound } from 'lucide-react';
import type { PublicUserProfile } from '@pet-adoption/models';

import { Pagination } from '@/components/pagination';
import { StateMessage } from '@/components/state-message';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { ApiError } from '../../../lib/api-client';
import { formatDate } from '../../../lib/format-date';
import { getErrorMessage } from '../../../lib/get-error-message';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { PetCard, PetCardSkeleton } from '../../pets/components/pet-card';
import { getUserPets, getUserProfile, userQueryKeys } from '../api/users';

const NOT_FOUND_CODES = ['USER_NOT_FOUND', 'INVALID_USER_ID'];
const gridClassName = 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
const SKELETON_COUNT = 4;

const readPage = (searchParams: URLSearchParams): number => {
  const page = Number(searchParams.get('page'));

  return Number.isInteger(page) && page > 0 ? page : 1;
};

/** The user's listed pets (not adopted, not hidden), paged in the URL. */
const ProfilePets = ({
  profile,
  isOwnProfile,
}: {
  profile: PublicUserProfile;
  isOwnProfile: boolean;
}) => {
  const { t } = useTranslation('profile');
  const [searchParams, setSearchParams] = useSearchParams();
  const page = readPage(searchParams);
  const query = { page };

  const pets = useQuery({
    queryKey: userQueryKeys.pets(profile._id, query),
    queryFn: () => getUserPets(profile._id, query),
    placeholderData: keepPreviousData,
  });

  const setPage = (next: number) => {
    setSearchParams(next > 1 ? { page: String(next) } : {}, { replace: true });
  };

  return (
    <section aria-labelledby="profile-pets-title" className="space-y-4">
      <h2 id="profile-pets-title" className="text-2xl">
        {t('petsTitle')}
      </h2>

      {pets.isPending ? (
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
      ) : pets.isError ? (
        <StateMessage
          tone="error"
          icon={TriangleAlert}
          title={getErrorMessage(pets.error, t('petsError'))}
          action={
            <Button variant="outline" onClick={() => void pets.refetch()}>
              {t('common:actions.retry')}
            </Button>
          }
        />
      ) : pets.data.totalItems === 0 ? (
        <StateMessage
          icon={PawPrint}
          title={t('petsEmpty', { name: profile.name })}
        />
      ) : (
        <div
          className={cn(
            'space-y-6 transition-opacity',
            pets.isFetching && pets.isPlaceholderData && 'opacity-60',
          )}
          aria-busy={pets.isFetching}
        >
          {pets.data.items.length === 0 ? (
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
              {pets.data.items.map((pet) => (
                <li key={pet._id}>
                  <PetCard pet={pet} isOwn={isOwnProfile} />
                </li>
              ))}
            </ul>
          )}

          <Pagination
            page={page}
            totalPages={pets.data.totalPages}
            onPageChange={setPage}
            label={t('petsPagination')}
          />
        </div>
      )}
    </section>
  );
};

/**
 * A member's public profile: name, member-since date and listed pets. The
 * API returns nothing else (no email or account data), and only to
 * signed-in users.
 */
const UserProfilePage = () => {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('profile');
  const location = useLocation();
  const { data: currentUser, isPending: isUserPending } = useCurrentUser();

  const profile = useQuery({
    queryKey: userQueryKeys.profile(id),
    queryFn: () => getUserProfile(id),
    enabled: Boolean(currentUser && id),
  });

  if (isUserPending) {
    return (
      <p role="status" className="sr-only">
        {t('loading')}
      </p>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (profile.isPending) {
    return (
      <section className="space-y-6">
        <p role="status" className="sr-only">
          {t('loading')}
        </p>
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
      </section>
    );
  }

  if (profile.isError) {
    const { error } = profile;
    const notFound =
      error instanceof ApiError && NOT_FOUND_CODES.includes(error.code);

    return notFound ? (
      <section className="space-y-6">
        <h1 className="text-3xl sm:text-4xl">{t('notFound')}</h1>
        <StateMessage
          icon={SearchX}
          title={t('notFoundHint')}
          action={
            <Button asChild variant="outline">
              <Link to="/pets">{t('browsePets')}</Link>
            </Button>
          }
        />
      </section>
    ) : (
      <StateMessage
        tone="error"
        icon={TriangleAlert}
        title={getErrorMessage(error, t('error'))}
        action={
          <Button variant="outline" onClick={() => void profile.refetch()}>
            {t('common:actions.retry')}
          </Button>
        }
      />
    );
  }

  const isOwnProfile = profile.data._id === currentUser._id;

  return (
    <section className="space-y-10">
      <header className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <UserRound aria-hidden="true" className="size-8" />
        </span>
        <div className="min-w-0 space-y-1">
          <h1 className="text-3xl break-words sm:text-4xl">
            {profile.data.name}
          </h1>
          <p className="text-muted-foreground">
            {t('memberSince', {
              date: formatDate(profile.data.memberSince, i18n.language),
            })}
          </p>
        </div>
      </header>

      {isOwnProfile && (
        <p
          role="note"
          className="rounded-md border bg-muted p-3 text-sm text-muted-foreground"
        >
          {t('ownProfileHint')}
        </p>
      )}

      <ProfilePets profile={profile.data} isOwnProfile={isOwnProfile} />
    </section>
  );
};

export { UserProfilePage };
