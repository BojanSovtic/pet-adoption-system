import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

import { ApiError } from '../../../lib/api-client';
import { getPet } from '../api/get-pet';

const PetDetailsPage = () => {
  const { id } = useParams();
  const { t } = useTranslation('pets');

  const {
    data: pet,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['pets', id],
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

    return <p>{t('error')}</p>;
  }

  return (
    <section className="space-y-6">
      <Button asChild variant="outline">
        <Link to="/pets">{t('backToPets')}</Link>
      </Button>

      <Card className="overflow-hidden">
        {pet.imageUrls.length > 0 && (
          <img
            src={pet.imageUrls[0]}
            alt={pet.name}
            className="aspect-[16/7] w-full object-cover"
          />
        )}

        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{pet.name}</h1>

              <p className="text-muted-foreground mt-1">
                {t(`species.${pet.species}`)} · {t('age', { count: pet.age })}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="secondary">{t(`status.${pet.status}`)}</Badge>

              <Button asChild variant="outline">
                <Link to={`/pets/${pet._id}/edit`}>{t('form.editTitle')}</Link>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <p className="leading-7">{pet.description}</p>
        </CardContent>
      </Card>
    </section>
  );
};

export { PetDetailsPage };
