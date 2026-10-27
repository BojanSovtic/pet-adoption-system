import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Inbox, TriangleAlert } from 'lucide-react';
import {
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
  APPLICATION_STATUSES,
  type AdminApplication,
} from '@pet-adoption/models';

import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StateMessage } from '@/components/state-message';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { formatDate } from '../../../lib/format-date';
import { getErrorMessage } from '../../../lib/get-error-message';
import { ApplicationStatusBadge } from '../../applications/components/application-status-badge';
import { adminQueryKeys, getAdminApplications } from '../api/admin';
import {
  readEnum,
  readPage,
  withListChanges,
} from '../utils/admin-list-params';

const ApplicationRow = ({ application }: { application: AdminApplication }) => {
  const { t, i18n } = useTranslation('admin');

  return (
    <li className="space-y-1 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/pets/${application.pet._id}`}
          className="font-semibold underline-offset-4 hover:underline"
        >
          {application.pet.name}
        </Link>
        <ApplicationStatusBadge status={application.status} />
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="inline text-muted-foreground">
            {t('applications.applicant')}:{' '}
          </dt>
          <dd className="inline break-all">
            {application.applicant.name} ({application.applicant.email})
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="inline text-muted-foreground">
            {t('applications.owner')}:{' '}
          </dt>
          <dd className="inline break-all">
            {application.owner.name} ({application.owner.email})
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        {t('applications.submitted', {
          date: formatDate(application.createdAt, i18n.language),
        })}
      </p>
    </li>
  );
};

const AdminApplicationsPage = () => {
  const { t } = useTranslation('admin');
  const { t: tApplications } = useTranslation('applications');
  const [searchParams, setSearchParams] = useSearchParams();
  const status = readEnum(searchParams, 'status', APPLICATION_STATUSES);
  const page = readPage(searchParams);

  const update = (changes: Record<string, string | number | undefined>) =>
    setSearchParams((current) => withListChanges(current, changes), {
      replace: true,
    });

  const query = { status, page, pageSize: ADMIN_LIST_DEFAULT_PAGE_SIZE };

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
    isPlaceholderData,
  } = useQuery({
    queryKey: adminQueryKeys.applications(query),
    queryFn: () => getAdminApplications(query),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-6">
      <PageHeader
        title={t('nav.applications')}
        description={t('applications.description')}
      />

      <div className="rounded-lg border bg-card p-3 shadow-card sm:max-w-xs">
        <NativeSelect
          value={status ?? ''}
          onChange={(event) => update({ status: event.target.value })}
          aria-label={t('applications.filterByStatus')}
        >
          <option value="">{t('applications.allStatuses')}</option>
          {APPLICATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {tApplications(`status.${value}`)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isPending ? (
        <Card className="gap-4 p-5">
          <p role="status" className="sr-only">
            {t('loading')}
          </p>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </Card>
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
      ) : data.items.length === 0 ? (
        <StateMessage icon={Inbox} title={t('applications.empty')} />
      ) : (
        <div
          className={cn(
            'space-y-4 transition-opacity',
            isFetching && isPlaceholderData && 'opacity-60',
          )}
          aria-busy={isFetching}
        >
          <p
            className="text-sm font-medium text-muted-foreground"
            aria-live="polite"
          >
            {t('applications.resultCount', { count: data.totalItems })}
          </p>
          <Card className="py-0">
            <ul className="divide-y px-5">
              {data.items.map((application) => (
                <ApplicationRow
                  key={application._id}
                  application={application}
                />
              ))}
            </ul>
          </Card>
          <Pagination
            page={page}
            totalPages={data.totalPages}
            onPageChange={(next) => update({ page: next })}
          />
        </div>
      )}
    </section>
  );
};

export { AdminApplicationsPage };
