import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PawPrint } from 'lucide-react';

import { UserMenu } from '../features/auth/components/user-menu';
import { LanguageSelect } from './language-select';

type AppShellProps = {
  children: ReactNode;
};

const AppShell = ({ children }: AppShellProps) => {
  const { t } = useTranslation('common');

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-card px-4 py-2 font-semibold shadow-raised focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        {t('skipToContent')}
      </a>

      {/* On narrow screens the actions wrap onto a second row instead of overflowing. */}
      <header className="border-b bg-card">
        <div className="page-container flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
          <Link
            to="/pets"
            className="flex items-center gap-2 rounded-md text-lg font-bold tracking-tight"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <PawPrint aria-hidden="true" className="size-5" />
            </span>
            {t('appTitle')}
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <UserMenu />
            <LanguageSelect />
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="page-container flex-1 py-8 outline-none sm:py-10"
      >
        {children}
      </main>
    </div>
  );
};

export { AppShell };
