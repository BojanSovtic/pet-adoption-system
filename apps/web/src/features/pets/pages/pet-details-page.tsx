import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

import { ApiError } from '../../../lib/api-client';
import { getErrorMessage } from '../../../lib/get-error-message';
import { getPet } from '../api/get-pet';
import { petQueryKeys } from '../api/pet-query-keys';
import { PetApplicationSection } from '../../applications/components/pet-application-section';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { DeletePetButton } from '../components/delete-pet-button';
import { PetGallery } from '../components/pet-gallery';
import { isPetOwner } from '../utils/is-pet-owner';

const PetDetailsPage = () => {
  const { id } = useParams();
  const { t } = useTranslation('pets');
  const { data: currentUser } = useCurrentUser();

  const {
    data: pet,
    isPending,
    isError,
    error,
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
    return <p>{t('loading')}</p>;
  }

  if (isError) {
    if (error instanceof ApiError && error.code === 'PET_NOT_FOUND') {
      return (
        <section className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">{t('notFound')}</h1>

          <Button asChild variant="outline">
            <Link to="/pets">{t('backToPets')}</Link>
          </Button>
        </section>
      );
    }

    return <p>{getErrorMessage(error, t('error'))}</p>;
  }

  return (
    <section className="space-y-6">
      <Button asChild variant="outline">
        <Link to="/pets">{t('backToPets')}</Link>
      </Button>

      <Card className="overflow-hidden">
        <PetGallery pet={pet} />

        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{pet.name}</h1>

              <p className="text-muted-foreground mt-1">
                {t(`species.${pet.species}`)} · {t('age', { count: pet.age })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{t(`status.${pet.status}`)}</Badge>

              {isPetOwner(pet, currentUser) && (
                <>
                  <Button asChild variant="outline">
                    <Link to={`/pets/${pet._id}/edit`}>
                      {t('form.editTitle')}
                    </Link>
                  </Button>

                  <DeletePetButton pet={pet} />
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <p className="leading-7">{pet.description}</p>

          <PetApplicationSection pet={pet} />
        </CardContent>
      </Card>
    </section>
  );
};

export { PetDetailsPage };
