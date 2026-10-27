import { useTranslation } from 'react-i18next';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

import { StateMessage } from '@/components/state-message';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { useCurrentUser } from '../../auth/hooks/use-current-user';

const SECTIONS = [
  { to: '/admin', key: 'overview', end: true },
  { to: '/admin/users', key: 'users', end: false },
  { to: '/admin/pets', key: 'pets', end: false },
  { to: '/admin/applications', key: 'applications', end: false },
  { to: '/admin/audit', key: 'audit', end: false },
] as const;

/**
 * Wraps every /admin page. Hiding the area from non-admins is for usability
 * only; the API refuses every /api/admin request from them anyway.
 */
const AdminLayout = () => {
  const { t } = useTranslation('admin');
  const location = useLocation();
  const { data: currentUser, isPending } = useCurrentUser();

  if (isPending) {
    return (
      <div className="space-y-6">
        <p role="status" className="sr-only">
          {t('loading')}
        </p>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (currentUser.role !== 'admin') {
    return (
      <section className="space-y-6">
        <h1 className="text-3xl sm:text-4xl">{t('forbidden.title')}</h1>
        <StateMessage
          icon={ShieldAlert}
          title={t('forbidden.description')}
          action={
            <Button asChild variant="outline">
              <Link to="/pets">{t('forbidden.back')}</Link>
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {/* Wraps on narrow screens, so every section stays visible (a
          scrolling tab bar would cut off the last labels). */}
      <nav aria-label={t('nav.label')}>
        <ul className="flex flex-wrap gap-x-1 border-b">
          {SECTIONS.map((section) => (
            <li key={section.key}>
              <NavLink
                to={section.to}
                end={section.end}
                className={({ isActive }) =>
                  cn(
                    '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-semibold transition-colors',
                    isActive
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {t(`nav.${section.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </div>
  );
};

export { AdminLayout };
