import { useTranslation } from 'react-i18next';
import type { ApplicationStatus } from '@pet-adoption/models';

import { Badge } from '@/components/ui/badge';

const variants = {
  pending: 'secondary',
  accepted: 'default',
  rejected: 'destructive',
  withdrawn: 'outline',
} as const satisfies Record<ApplicationStatus, string>;

type ApplicationStatusBadgeProps = {
  status: ApplicationStatus;
};

const ApplicationStatusBadge = ({ status }: ApplicationStatusBadgeProps) => {
  const { t } = useTranslation('applications');

  return <Badge variant={variants[status]}>{t(`status.${status}`)}</Badge>;
};

export { ApplicationStatusBadge };
