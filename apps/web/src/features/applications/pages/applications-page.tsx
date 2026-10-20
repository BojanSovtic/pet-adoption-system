import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { MyApplication, ReceivedApplication } from '@pet-adoption/models';

import { Card, CardContent, CardHeader } from '@/components/ui/card';

import { getErrorMessage } from '../../../lib/get-error-message';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import {
  applicationQueryKeys,
  getMyApplications,
  getReceivedApplications,
} from '../api/applications';
import { ApplicationActions } from '../components/application-actions';
import { ApplicationStatusBadge } from '../components/application-status-badge';

// Serbian texts use the Latin script; plain "sr" would format in Cyrillic.
const toDateLocale = (language: string) =>
  language === 'sr' ? 'sr-Latn' : language;

type ApplicationCardProps = {
  application: MyApplication | ReceivedApplication;
  actor: 'owner' | 'applicant';
};

const ApplicationCard = ({ application, actor }: ApplicationCardProps) => {
  const { t, i18n } = useTranslation('applications');
  const submittedOn = new Date(application.createdAt).toLocaleDateString(
    toDateLocale(i18n.language),
  );

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
  actor: 'owner' | 'applicant';
  query: UseQueryResult<Array<MyApplication | ReceivedApplication>>;
};

const ApplicationList = ({
  title,
  emptyText,
  actor,
  query,
}: ApplicationListProps) => {
  const { t } = useTranslation('applications');

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>

      {query.isPending ? (
        <p>{t('loading')}</p>
      ) : query.isError ? (
        <p>{getErrorMessage(query.error, t('error'))}</p>
      ) : query.data.length === 0 ? (
        <p className="text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid gap-4">
          {query.data.map((application) => (
            <ApplicationCard
              key={application._id}
              application={application}
              actor={actor}
            />
          ))}
        </div>
      )}
    </section>
  );
};

const ApplicationsPage = () => {
  const { t } = useTranslation('applications');
  const location = useLocation();
  const { data: currentUser, isPending: isUserPending } = useCurrentUser();
  const isSignedIn = Boolean(currentUser);

  const myApplications = useQuery<Array<MyApplication | ReceivedApplication>>({
    queryKey: applicationQueryKeys.mine,
    queryFn: getMyApplications,
    enabled: isSignedIn,
  });

  const receivedApplications = useQuery<
    Array<MyApplication | ReceivedApplication>
  >({
    queryKey: applicationQueryKeys.received,
    queryFn: getReceivedApplications,
    enabled: isSignedIn,
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
        actor="owner"
        query={receivedApplications}
      />

      <ApplicationList
        title={t('mine.title')}
        emptyText={t('mine.empty')}
        actor="applicant"
        query={myApplications}
      />
    </div>
  );
};

export { ApplicationsPage };
