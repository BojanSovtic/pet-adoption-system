import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

const NotFoundPage = () => {
  const { t } = useTranslation('common');

  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">
        {t('notFound.title')}
      </h1>

      <p className="text-muted-foreground">{t('notFound.description')}</p>

      <Button asChild variant="outline">
        <Link to="/pets">{t('notFound.backToPets')}</Link>
      </Button>
    </section>
  );
};

export { NotFoundPage };
