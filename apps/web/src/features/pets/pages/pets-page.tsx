import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../../lib/api-client';
import { getPets } from '../api/get-pets';
import { PetCard } from '../components/pet-card';

const PetsPage = () => {
  const { t } = useTranslation('pets');

  const {
    data: pets,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['pets'],
    queryFn: getPets,
  });

  if (isPending) {
    return <p>{t('loading')}</p>;
  }

  if (isError) {
    if (error instanceof ApiError) {
      return <p>{error.code}</p>;
    }

    return <p>{t('error')}</p>;
  }

  if (pets.length === 0) {
    return <p>{t('empty')}</p>;
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {pets.map((pet) => (
          <PetCard key={pet._id} pet={pet} />
        ))}
      </div>
    </section>
  );
};

export { PetsPage };
