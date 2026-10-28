import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import type {
  MyApplication,
  Paginated,
  ReceivedApplication,
} from '@pet-adoption/models';

import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

import { getErrorMessage } from '../../../lib/get-error-message';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import {
  applicationQueryKeys,
  getMyApplications,
  getReceivedApplications,
} from '../api/applications';
import { formatDate } from '../../../lib/format-date';
import { ApplicationActions } from '../components/application-actions';
import { ApplicationStatusBadge } from '../components/application-status-badge';

type ApplicationCardProps = {
  application: MyApplication | ReceivedApplication;
  actor: 'owner' | 'applicant';
};

const ApplicationCard = ({ application, actor }: ApplicationCardProps) => {
  const { t, i18n } = useTranslation('applications');
  const submittedOn = formatDate(application.createdAt, i18n.language);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              to={`/pets/${application.pet._id}`}
              className="text-lg font-semibold hover:underline"
            >
              {application.pet.name}
            </Link>
            <p className="text-sm text-muted-foreground">
              {t('submittedOn', { date: submittedOn })}
            </p>
          </div>

          <ApplicationStatusBadge status={application.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {'applicant' in application && (
          <p className="text-sm">
            <span className="font-medium">{t('applicant')}:</span>{' '}
            {application.applicant.name} ({application.applicant.email})
          </p>
        )}

        <p className="text-sm leading-6 whitespace-pre-line">
          {application.message}
        </p>

        <ApplicationActions
          applicationId={application._id}
          status={application.status}
          actor={actor}
        />
      </CardContent>
    </Card>
  );
};

type ApplicationListProps = {
  title: string;
  emptyText: string;
  paginationLabel: string;
  actor: 'owner' | 'applicant';
  query: UseQueryResult<Paginated<MyApplication | ReceivedApplication>>;
  page: number;
  onPageChange: (page: number) => void;
};

const ApplicationList = ({
  title,
  emptyText,
  paginationLabel,
  actor,
  query,
  page,
  onPageChange,
}: ApplicationListProps) => {
  const { t } = useTranslation('applications');

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>

      {query.isPending ? (
        <p>{t('loading')}</p>
      ) : query.isError ? (
        <p>{getErrorMessage(query.error, t('error'))}</p>
      ) : query.data.totalItems === 0 ? (
        <p className="text-muted-foreground">{emptyText}</p>
      ) : (
        <div
          className={`space-y-4 transition-opacity ${query.isFetching && query.isPlaceholderData ? 'opacity-60' : ''}`}
          aria-busy={query.isFetching}
        >
          {query.data.items.length === 0 ? (
            // A page number past the end, e.g. from an old link.
            <div className="space-y-3">
              <p className="text-muted-foreground">{t('pageOutOfRange')}</p>
              <Button variant="outline" onClick={() => onPageChange(1)}>
                {t('firstPage')}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {query.data.items.map((application) => (
                <ApplicationCard
                  key={application._id}
                  application={application}
                  actor={actor}
                />
              ))}
            </div>
          )}

          <Pagination
            page={page}
            totalPages={query.data.totalPages}
            onPageChange={onPageChange}
            label={paginationLabel}
          />
        </div>
      )}
    </section>
  );
};

/** Page numbers live in the URL; anything invalid falls back to page 1. */
const PAGE_PARAMS = { received: 'receivedPage', mine: 'minePage' } as const;

const readPage = (searchParams: URLSearchParams, name: string): number => {
  const page = Number(searchParams.get(name));

  return Number.isInteger(page) && page > 0 ? page : 1;
};

const ApplicationsPage = () => {
  const { t } = useTranslation('applications');
  const location = useLocation();
  const { data: currentUser, isPending: isUserPending } = useCurrentUser();
  const isSignedIn = Boolean(currentUser);

  const [searchParams, setSearchParams] = useSearchParams();
  const receivedPage = readPage(searchParams, PAGE_PARAMS.received);
  const minePage = readPage(searchParams, PAGE_PARAMS.mine);

  const setPage = (name: string, page: number) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);

        if (page > 1) {
          next.set(name, String(page));
        } else {
          next.delete(name);
        }

        return next;
      },
      { replace: true },
    );
  };

  const receivedQuery = { page: receivedPage };
  const receivedApplications = useQuery<
    Paginated<MyApplication | ReceivedApplication>
  >({
    queryKey: applicationQueryKeys.received(receivedQuery),
    queryFn: () => getReceivedApplications(receivedQuery),
    enabled: isSignedIn,
    // Keep showing the previous page while the next one loads.
    placeholderData: keepPreviousData,
  });

  const mineQuery = { page: minePage };
  const myApplications = useQuery<
    Paginated<MyApplication | ReceivedApplication>
  >({
    queryKey: applicationQueryKeys.mine(mineQuery),
    queryFn: () => getMyApplications(mineQuery),
    enabled: isSignedIn,
    placeholderData: keepPreviousData,
  });

  if (isUserPending) {
    return <p>{t('loading')}</p>;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>

      <ApplicationList
        title={t('received.title')}
        emptyText={t('received.empty')}
        paginationLabel={t('received.pagination')}
        actor="owner"
        query={receivedApplications}
        page={receivedPage}
        onPageChange={(page) => setPage(PAGE_PARAMS.received, page)}
      />

      <ApplicationList
        title={t('mine.title')}
        emptyText={t('mine.empty')}
        paginationLabel={t('mine.pagination')}
        actor="applicant"
        query={myApplications}
        page={minePage}
        onPageChange={(page) => setPage(PAGE_PARAMS.mine, page)}
      />
    </div>
  );
};

export { ApplicationsPage };
