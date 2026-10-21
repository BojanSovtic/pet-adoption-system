import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { UserMenu } from '../features/auth/components/user-menu';
import { LanguageSelect } from './language-select';

type AppShellProps = {
  children: ReactNode;
};

const AppShell = ({ children }: AppShellProps) => {
  const { t } = useTranslation('common');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/pets" className="text-lg font-semibold tracking-tight">
            {t('appTitle')}
          </Link>

          <div className="flex items-center gap-3">
            <UserMenu />
            <LanguageSelect />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
};

export { AppShell };
