import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { APPLICATION_STATUSES, PET_STATUSES } from '@pet-adoption/models';

import { PageHeader } from '@/components/page-header';
import { StateMessage } from '@/components/state-message';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { getErrorMessage } from '../../../lib/get-error-message';
import { adminQueryKeys, getAdminStats } from '../api/admin';
import { AuditEntryItem } from '../components/audit-entry-item';

type StatCardProps = {
  title: string;
  total: number;
  to: string;
  children: ReactNode;
};

const StatCard = ({ title, total, to, children }: StatCardProps) => {
  const { t } = useTranslation('admin');

  return (
    <Card className="gap-3 p-5">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <p className="text-4xl font-semibold tabular-nums">{total}</p>
      <div className="text-sm text-muted-foreground">{children}</div>
      <Link
        to={to}
        className="mt-auto text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        {t('dashboard.viewAll')}
        <span className="sr-only"> ({title})</span>
      </Link>
    </Card>
  );
};

/** "available 3 · pending 1 · adopted 2" with translated status names. */
const Breakdown = ({ items }: { items: Array<[string, number]> }) => (
  <ul className="flex flex-wrap gap-x-3 gap-y-1">
    {items.map(([label, count]) => (
      <li key={label}>
        {label} <span className="font-semibold tabular-nums">{count}</span>
      </li>
    ))}
  </ul>
);

const AdminDashboardPage = () => {
  const { t } = useTranslation('admin');
  const { t: tPets } = useTranslation('pets');
  const { t: tApplications } = useTranslation('applications');

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: adminQueryKeys.stats,
    queryFn: getAdminStats,
  });

  return (
    <section className="space-y-8">
      <PageHeader title={t('title')} description={t('dashboard.description')} />

      {isPending ? (
        <div className="grid gap-6 md:grid-cols-3">
          <p role="status" className="sr-only">
            {t('loading')}
          </p>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <StateMessage
          tone="error"
          icon={TriangleAlert}
          title={getErrorMessage(error, t('error'))}
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              {t('common:actions.retry')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            <StatCard
              title={t('dashboard.users')}
              total={data.users.total}
              to="/admin/users"
            >
              <Breakdown
                items={[
                  [t('dashboard.adminsLabel'), data.users.admins],
                  [t('dashboard.suspendedLabel'), data.users.suspended],
                ]}
              />
            </StatCard>

            <StatCard
              title={t('dashboard.pets')}
              total={data.pets.total}
              to="/admin/pets"
            >
              <Breakdown
                items={[
                  ...PET_STATUSES.map((status): [string, number] => [
                    tPets(`status.${status}`),
                    data.pets[status],
                  ]),
                  [t('dashboard.hiddenLabel'), data.pets.hidden],
                ]}
              />
            </StatCard>

            <StatCard
              title={t('dashboard.applications')}
              total={data.applications.total}
              to="/admin/applications"
            >
              <Breakdown
                items={APPLICATION_STATUSES.map((status) => [
                  tApplications(`status.${status}`),
                  data.applications[status],
                ])}
              />
            </StatCard>
          </div>

          <section aria-labelledby="admin-activity" className="space-y-3">
            <h2 id="admin-activity" className="text-xl">
              {t('dashboard.recentActivity')}
            </h2>
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.noActivity')}
              </p>
            ) : (
              <Card className="py-0">
                <ul className="divide-y px-5">
                  {data.recentActivity.map((entry) => (
                    <AuditEntryItem key={entry._id} entry={entry} />
                  ))}
                </ul>
              </Card>
            )}
            <Link
              to="/admin/audit"
              className="inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t('dashboard.viewAudit')}
            </Link>
          </section>
        </>
      )}
    </section>
  );
};

export { AdminDashboardPage };
