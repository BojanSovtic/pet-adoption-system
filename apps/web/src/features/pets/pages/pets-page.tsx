import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PET_SPECIES, PET_STATUSES } from '@pet-adoption/models';

import { getErrorMessage } from '../../../lib/get-error-message';
import { getPets } from '../api/get-pets';
import { PetCard } from '../components/pet-card';
import { filterPets } from '../utils/filter-pets';
import type { SpeciesFilter, StatusFilter } from '../utils/filter-pets';

const PetsPage = () => {
  const { t } = useTranslation('pets');
  const [search, setSearch] = useState('');
  const [species, setSpecies] = useState<SpeciesFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const {
    data: pets,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['pets'],
    queryFn: getPets,
  });

  const filteredPets = useMemo(
    () => filterPets({ pets: pets ?? [], search, species, status }),
    [pets, search, species, status],
  );

  if (isPending) {
    return <p>{t('loading')}</p>;
  }

  if (isError) {
    return <p>{getErrorMessage(error, t('error'))}</p>;
  }

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
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <select
          value={species}
          onChange={(event) => setSpecies(event.target.value as SpeciesFilter)}
          aria-label={t('filterBySpecies')}
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">{t('speciesFilter.all')}</option>
          {PET_SPECIES.map((value) => (
            <option key={value} value={value}>
              {t(`species.${value}`)}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          aria-label={t('filterByStatus')}
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">{t('statusFilter.all')}</option>
          {PET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`status.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {filteredPets.length === 0 ? (
        <p className="text-muted-foreground">{t('noMatchingPets')}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPets.map((pet) => (
            <PetCard key={pet._id} pet={pet} />
          ))}
        </div>
      )}
    </section>
  );
};

export { PetsPage };
