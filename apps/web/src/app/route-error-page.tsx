import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';

import { StateMessage } from '@/components/state-message';
import { Button } from '@/components/ui/button';
import { reloadPage } from '@/lib/reload-page';

type RouteErrorPageProps = {
  /** True for the outermost boundary, which renders without the app shell. */
  fullPage?: boolean;
};

/**
 * `errorElement` for the routes: shown instead of a blank screen when a page
 * throws while rendering. It never shows the error itself (message or stack);
 * React Router already logs it with the component stack (`console.error`).
 * Navigating away, e.g. "Back to pets", resets the boundary.
 */
const RouteErrorPage = ({ fullPage = false }: RouteErrorPageProps) => {
  const { t } = useTranslation('common');

  const content = (
    <StateMessage
      tone="error"
      icon={TriangleAlert}
      title={t('errorPage.title')}
      description={t('errorPage.description')}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reloadPage}>{t('errorPage.reload')}</Button>
          <Button asChild variant="outline">
            <Link to="/pets">{t('notFound.backToPets')}</Link>
          </Button>
        </div>
      }
    />
  );

  if (!fullPage) {
    return content;
  }

  return (
    <div className="flex min-h-screen items-center bg-background text-foreground">
      <main className="page-container w-full py-10">{content}</main>
    </div>
  );
};

export { RouteErrorPage };
