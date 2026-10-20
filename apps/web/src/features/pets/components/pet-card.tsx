import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';

import type { Pet } from '@pet-adoption/models';

type PetCardProps = {
  pet: Pet;
};

const PetCard = ({ pet }: PetCardProps) => {
  const { t } = useTranslation('pets');

  return (
    <Card className="overflow-hidden">
      {pet.imageUrl ? (
        <img
          src={pet.imageUrl}
          alt={pet.name}
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-muted">
          <span className="text-muted-foreground text-sm">{t('noImage')}</span>
        </div>
      )}

      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{pet.name}</h2>

            <p className="text-muted-foreground text-sm">
              {t(`species.${pet.species}`)} · {t('age', { count: pet.age })}
            </p>
          </div>

          <Badge variant="secondary">{t(`status.${pet.status}`)}</Badge>
        </div>
      </CardHeader>

      <CardContent>
        <p className="text-muted-foreground line-clamp-3">{pet.description}</p>
      </CardContent>

      <CardFooter>
        <Button asChild>
          <Link to={`/pets/${pet._id}`}>{t('viewDetails')}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

export { PetCard };
