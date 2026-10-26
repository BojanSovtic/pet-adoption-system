import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, PawPrint, SearchX, TriangleAlert } from 'lucide-react';
import type { Pet } from '@pet-adoption/models';

import { StateMessage } from '@/components/state-message';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { ApiError } from '../../../lib/api-client';
import { formatDate } from '../../../lib/format-date';
import { getErrorMessage } from '../../../lib/get-error-message';
import { getPet } from '../api/get-pet';
import { petQueryKeys } from '../api/pet-query-keys';
import { PetApplicationSection } from '../../applications/components/pet-application-section';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { AdoptionSteps } from '../components/adoption-steps';
import { DeletePetButton } from '../components/delete-pet-button';
import { PetGallery } from '../components/pet-gallery';
import { PetLifestyle } from '../components/pet-lifestyle';
import { PetStatusBadge } from '../components/pet-status-badge';
import { isPetOwner } from '../utils/is-pet-owner';

const BackToPets = () => {
  const { t } = useTranslation('pets');

  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3">
      <Link to="/pets">
        <ArrowLeft aria-hidden="true" />
        {t('backToPets')}
      </Link>
    </Button>
  );
};

/** Short facts as label/value pairs, scannable before the long description. */
const PetFacts = ({ pet }: { pet: Pet }) => {
  const { t, i18n } = useTranslation('pets');

  // Sex and breed only when known: "Unknown" tiles would add noise.
  const facts = [
    { label: t('facts.species'), value: t(`species.${pet.species}`) },
    ...(pet.sex === 'unknown'
      ? []
      : [{ label: t('facts.sex'), value: t(`sex.${pet.sex}`) }]),
    { label: t('facts.age'), value: t('age', { count: pet.age }) },
    ...(pet.breed ? [{ label: t('facts.breed'), value: pet.breed }] : []),
    {
      label: t('facts.listed'),
      value: formatDate(pet.createdAt, i18n.language),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label} className="rounded-md bg-muted px-3 py-2">
          <dt className="text-xs font-medium text-muted-foreground">
            {fact.label}
          </dt>
          <dd className="text-sm font-semibold break-words">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
};

/** Same shape as the loaded page, so nothing jumps when the data arrives. */
const PetDetailsSkeleton = () => {
  const { t } = useTranslation('pets');

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <p role="status" className="sr-only">
        {t('loadingPet')}
      </p>
      <Skeleton className="aspect-[4/3] rounded-lg" />
      <Card className="gap-4 p-6">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    </div>
  );
};

const PetDetailsPage = () => {
  const { id } = useParams();
  const { t } = useTranslation('pets');
  const { data: currentUser } = useCurrentUser();

  const {
    data: pet,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: petQueryKeys.detail(id ?? ''),
    queryFn: () => {
      if (!id) {
        throw new Error('Pet ID is required');
      }

      return getPet(id);
    },
    enabled: Boolean(id),
  });

  if (isPending) {
    return (
      <section className="space-y-6">
        <BackToPets />
        <PetDetailsSkeleton />
      </section>
    );
  }

  if (isError) {
    const notFound =
      error instanceof ApiError && error.code === 'PET_NOT_FOUND';

    return (
      <section className="space-y-6">
        <BackToPets />
        {notFound ? (
          <>
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
          </>
        ) : (
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
        )}
      </section>
    );
  }

  const isOwner = isPetOwner(pet, currentUser);

  return (
    <section className="space-y-6">
      <BackToPets />

      {/*
        DOM order is the mobile order: photo, then the adoption panel, then
        the details. On wide screens the panel moves into a sticky right column.
      */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="lg:col-start-1">
          {pet.images.length > 0 ? (
            <PetGallery pet={pet} />
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border bg-muted text-muted-foreground">
              <PawPrint aria-hidden="true" className="size-10" />
              <span className="text-sm">{t('noImage')}</span>
            </div>
          )}
        </div>

        <Card className="gap-6 p-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div className="space-y-3">
            <PetStatusBadge status={pet.status} />
            <h1 className="text-3xl sm:text-4xl">{pet.name}</h1>
            <PetFacts pet={pet} />
          </div>

          {isOwner && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to={`/pets/${pet._id}/edit`}>{t('form.editTitle')}</Link>
              </Button>
              <DeletePetButton pet={pet} />
            </div>
          )}

          <div className="border-t pt-6">
            <PetApplicationSection pet={pet} />
          </div>
        </Card>

        <div className="space-y-8 lg:col-start-1">
          <section aria-labelledby="about-pet" className="space-y-3">
            <h2 id="about-pet" className="text-2xl">
              {t('about', { name: pet.name })}
            </h2>
            <p className="max-w-prose leading-7 whitespace-pre-line">
              {pet.description}
            </p>
          </section>

          <PetLifestyle pet={pet} />

          {!isOwner && pet.status !== 'adopted' && (
            <AdoptionSteps petName={pet.name} />
          )}
        </div>
      </div>
    </section>
  );
};

export { PetDetailsPage };
