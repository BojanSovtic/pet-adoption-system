import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';

type PendingApplicationsBadgeProps = {
  count: number | undefined;
};

/**
 * The number of applications awaiting the owner's decision, shown next to
 * the account menu and its "Applications" link. Nothing while loading, after
 * an error or at zero. Screen readers get the full sentence instead of the
 * bare number.
 */
const PendingApplicationsBadge = ({ count }: PendingApplicationsBadgeProps) => {
  const { t } = useTranslation('applications');

  if (!count) {
    return null;
  }

  return (
    <Badge variant="warning" className="tabular-nums">
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      {/* The comma separates it from the control's own name. */}
      <span className="sr-only">, {t('pendingBadge', { count })}</span>
    </Badge>
  );
};

export { PendingApplicationsBadge };
