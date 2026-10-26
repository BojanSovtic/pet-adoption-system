import { useTranslation } from 'react-i18next';
import type { PetStatus } from '@pet-adoption/models';

import { Badge } from '@/components/ui/badge';

const variants = {
  available: 'success',
  pending: 'warning',
  adopted: 'neutral',
} as const satisfies Record<PetStatus, string>;

type PetStatusBadgeProps = {
  status: PetStatus;
  className?: string;
};

const PetStatusBadge = ({ status, className }: PetStatusBadgeProps) => {
  const { t } = useTranslation('pets');

  return (
    <Badge variant={variants[status]} className={className}>
      {t(`status.${status}`)}
    </Badge>
  );
};

export { PetStatusBadge };
