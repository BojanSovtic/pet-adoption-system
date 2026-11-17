import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

/**
 * Explains the `*` marker once, at the top of a form with several fields
 * (see `Label`'s `required` prop).
 */
const RequiredFieldsNote = ({ className }: { className?: string }) => {
  const { t } = useTranslation('common');

  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      {t('form.requiredNote')}
    </p>
  );
};

export { RequiredFieldsNote };
