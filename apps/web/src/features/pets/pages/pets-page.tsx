import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../../lib/api-client';
import { getPets } from '../api/get-pets';
import { PetCard } from '../components/pet-card';

export const PetsPage = () => {
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
    <main>
      <h1>{t('title')}</h1>

      {pets.map((pet) => (
        <PetCard key={pet._id} pet={pet} />
      ))}
    </main>
  );
};
