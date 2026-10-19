import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { UserMenu } from '../features/auth/components/user-menu';

type AppShellProps = {
  children: ReactNode;
};

const AppShell = ({ children }: AppShellProps) => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/pets" className="text-lg font-semibold tracking-tight">
            Pet Adoption
          </Link>

          <UserMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
};

export { AppShell };
