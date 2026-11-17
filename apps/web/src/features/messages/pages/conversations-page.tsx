import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { MessagesSquare, PawPrint, TriangleAlert } from 'lucide-react';
import type { Conversation } from '@pet-adoption/models';

import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StateMessage } from '@/components/state-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { formatDateTime } from '../../../lib/format-date';
import { getErrorMessage } from '../../../lib/get-error-message';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { conversationQueryKeys, getConversations } from '../api/conversations';

const SKELETON_COUNT = 3;

const readPage = (searchParams: URLSearchParams): number => {
  const page = Number(searchParams.get('page'));

  return Number.isInteger(page) && page > 0 ? page : 1;
};

/**
 * One conversation. The whole card is clickable through the pet name link
 * (its `::after` covers the card), as on pet cards.
 */
const ConversationItem = ({ conversation }: { conversation: Conversation }) => {
  const { t, i18n } = useTranslation('messages');
  const { pet, lastMessage, otherParticipant, role } = conversation;

  return (
    <Card className="relative flex-row items-start gap-4 p-4 transition-shadow hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
      <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {pet.imageUrl ? (
          <img
            src={pet.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <PawPrint aria-hidden="true" className="size-6" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={`/messages/${conversation._id}`}
            className="text-lg font-semibold outline-none after:absolute after:inset-0 hover:text-primary"
          >
            {pet.name}
          </Link>
          <Badge variant={role === 'owner' ? 'secondary' : 'neutral'}>
            {t(`role.${role}`)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('withUser', { name: otherParticipant.name })}
          {' · '}
          <time dateTime={lastMessage.createdAt}>
            {formatDateTime(lastMessage.createdAt, i18n.language)}
          </time>
        </p>
        <p className="line-clamp-2 text-sm break-words">
          {lastMessage.fromMe
            ? t('fromMe', { body: lastMessage.body })
            : lastMessage.body}
        </p>
      </div>
    </Card>
  );
};

const ConversationsPage = () => {
  const { t } = useTranslation('messages');
  const location = useLocation();
  const { data: currentUser, isPending: isUserPending } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = readPage(searchParams);

  const query = { page };
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
    isPlaceholderData,
  } = useQuery({
    queryKey: conversationQueryKeys.list(query),
    queryFn: () => getConversations(query),
    enabled: Boolean(currentUser),
    placeholderData: keepPreviousData,
  });

  const setPage = (next: number) => {
    setSearchParams(next > 1 ? { page: String(next) } : {}, { replace: true });
  };

  if (isUserPending) {
    return (
      <p role="status" className="sr-only">
        {t('loading')}
      </p>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <section className="space-y-8">
      <PageHeader title={t('title')} description={t('subtitle')} />

      {isPending ? (
        <div>
          <p role="status" className="sr-only">
            {t('loading')}
          </p>
          <ul className="grid gap-3">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <li key={index}>
                <Skeleton className="h-24 w-full rounded-lg" />
              </li>
            ))}
          </ul>
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
      ) : data.totalItems === 0 ? (
        <StateMessage
          icon={MessagesSquare}
          title={t('empty')}
          description={t('emptyHint')}
          action={
            <Button asChild variant="outline">
              <Link to="/pets">{t('browsePets')}</Link>
            </Button>
          }
        />
      ) : (
        <div
          className={cn(
            'space-y-4 transition-opacity',
            isFetching && isPlaceholderData && 'opacity-60',
          )}
          aria-busy={isFetching}
        >
          {data.items.length === 0 ? (
            // A page number past the end, e.g. from an old link.
            <StateMessage
              title={t('pageOutOfRange')}
              action={
                <Button variant="outline" onClick={() => setPage(1)}>
                  {t('firstPage')}
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-3">
              {data.items.map((conversation) => (
                <li key={conversation._id}>
                  <ConversationItem conversation={conversation} />
                </li>
              ))}
            </ul>
          )}

          <Pagination
            page={page}
            totalPages={data.totalPages}
            onPageChange={setPage}
            label={t('pagination')}
          />
        </div>
      )}
    </section>
  );
};

export { ConversationsPage };
