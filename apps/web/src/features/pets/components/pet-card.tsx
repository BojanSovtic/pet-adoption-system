import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Check, PawPrint, UserRound } from 'lucide-react';
import { PET_COMPATIBILITY_TARGETS, type Pet } from '@pet-adoption/models';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { toPetListReturnState } from '../utils/pet-list-params';
import { PetStatusBadge } from './pet-status-badge';

type PetCardProps = {
  pet: Pet;
  /** The signed-in user posted this pet (display only; the API decides). */
  isOwn?: boolean;
};

/**
 * The whole card is clickable through one link (the name): its `::after`
 * covers the card, so screen readers hear a single link, not a duplicate
 * "View details". The card shows the focus outline when that link is focused.
 */
const PetCard = ({ pet, isOwn = false }: PetCardProps) => {
  const { t } = useTranslation('pets');
  // The list's page, search and filters, so "Back to pets" can return to them.
  const location = useLocation();
  // Only confirmed matches become chips; "no" and "not known" are on the details page.
  const goodWith = PET_COMPATIBILITY_TARGETS.filter(
    (target) => pet.compatibility[target] === 'yes',
  );
  const meta = [
    t(`species.${pet.species}`),
    pet.sex === 'unknown' ? null : t(`sex.${pet.sex}`),
    t('age', { count: pet.age }),
  ].filter(Boolean);

  return (
    <Card className="group relative h-full gap-0 overflow-hidden py-0 transition-shadow hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {pet.imageUrl ? (
          // Decorative here: the name below already labels the link.
          <img
            src={pet.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <PawPrint aria-hidden="true" className="size-8" />
            <span className="text-sm">{t('noImage')}</span>
          </div>
        )}

        <PetStatusBadge
          status={pet.status}
          className="absolute left-3 top-3 shadow-card"
        />

        {isOwn && (
          <Badge
            variant="secondary"
            className="absolute right-3 top-3 shadow-card"
          >
            <UserRound aria-hidden="true" />
            {t('yourPet')}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4 sm:p-5">
        <h2 className="text-lg">
          <Link
            to={`/pets/${pet._id}`}
            state={toPetListReturnState(location.search)}
            className="outline-none after:absolute after:inset-0 hover:text-primary"
          >
            {pet.name}
          </Link>
        </h2>

        <p className="text-sm font-medium text-muted-foreground">
          {meta.join(' · ')}
        </p>

        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {pet.description}
        </p>

        {goodWith.length > 0 && (
          <ul className="mt-auto flex flex-wrap gap-1.5 pt-2">
            {goodWith.map((target) => (
              <li key={target}>
                <Badge variant="outline" className="font-medium">
                  <Check aria-hidden="true" className="text-success" />
                  {t(`goodWith.${target}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

/** Same footprint as PetCard, for the loading state. */
const PetCardSkeleton = () => {
  return (
    <Card className="h-full gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-3 p-4 sm:p-5">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-full" />
      </div>
    </Card>
  );
};

export { PetCard, PetCardSkeleton };
