import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, PawPrint, SearchX, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { Conversation, ConversationMessage } from '@pet-adoption/models';

import { PageHeader } from '@/components/page-header';
import { StateMessage } from '@/components/state-message';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { ApiError } from '../../../lib/api-client';
import { formatDateTime } from '../../../lib/format-date';
import { getErrorMessage } from '../../../lib/get-error-message';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { PetStatusBadge } from '../../pets/components/pet-status-badge';
import {
  conversationQueryKeys,
  getConversation,
  getConversationMessages,
  sendMessage,
} from '../api/conversations';
import { MessageForm } from '../components/message-form';

// The API answers 404 for conversations the user is not part of, so a
// stranger's link looks exactly like a missing conversation.
const NOT_FOUND_CODES = ['CONVERSATION_NOT_FOUND', 'INVALID_CONVERSATION_ID'];

const BackToMessages = () => {
  const { t } = useTranslation('messages');

  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3">
      <Link to="/messages">
        <ArrowLeft aria-hidden="true" />
        {t('conversation.back')}
      </Link>
    </Button>
  );
};

/** The pet the conversation is about, and the other person's profile. */
const ConversationContext = ({
  conversation,
}: {
  conversation: Conversation;
}) => {
  const { t } = useTranslation('messages');
  const { pet, otherParticipant } = conversation;

  return (
    <Card className="flex-row flex-wrap items-center gap-4 p-4">
      <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {pet.imageUrl ? (
          <img src={pet.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <PawPrint aria-hidden="true" className="size-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {t('conversation.aboutPet')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/pets/${pet._id}`}
            className="font-semibold underline-offset-4 hover:underline"
          >
            {pet.name}
          </Link>
          <PetStatusBadge status={pet.status} />
        </div>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to={`/users/${otherParticipant._id}`}>
          {t('conversation.viewProfile', { name: otherParticipant.name })}
        </Link>
      </Button>
    </Card>
  );
};

const MessageItem = ({
  message,
  otherName,
}: {
  message: ConversationMessage;
  otherName: string;
}) => {
  const { t, i18n } = useTranslation('messages');

  return (
    <li
      className={cn('flex', message.fromMe ? 'justify-end' : 'justify-start')}
    >
      <article
        className={cn(
          'max-w-[85%] space-y-1 rounded-lg border px-4 py-3 sm:max-w-[75%]',
          message.fromMe
            ? 'border-transparent bg-secondary text-secondary-foreground'
            : 'bg-card',
        )}
      >
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-semibold">
            {message.fromMe ? t('you') : otherName}
          </span>
          <time dateTime={message.createdAt}>
            {formatDateTime(message.createdAt, i18n.language)}
          </time>
        </p>
        <p className="text-sm leading-6 break-words whitespace-pre-line">
          {message.body}
        </p>
      </article>
    </li>
  );
};

const MessageThread = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('messages');
  const queryClient = useQueryClient();
  const { _id: id, otherParticipant } = conversation;

  // Newest page first; "Load earlier messages" fetches the page before the
  // oldest message shown.
  const messages = useInfiniteQuery({
    queryKey: conversationQueryKeys.messages(id),
    queryFn: ({ pageParam }) =>
      getConversationMessages(id, pageParam ? { before: pageParam } : {}),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasOlder ? lastPage.items[0]?._id : undefined,
  });

  const mutation = useMutation({
    // The form shows the error itself.
    meta: { skipGlobalErrorToast: true },
    mutationFn: (body: string) => sendMessage(id, { body }),
    onSuccess: async () => {
      // Refreshes this thread, its header and the conversation list.
      await queryClient.invalidateQueries({
        queryKey: conversationQueryKeys.all,
      });
      toast.success(t('form.sent'));
    },
  });

  // Pages are newest first; each page is oldest first.
  const items =
    messages.data?.pages
      .slice()
      .reverse()
      .flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <section aria-labelledby="messages-title" className="space-y-4">
        <h2 id="messages-title" className="sr-only">
          {t('conversation.messagesLabel')}
        </h2>

        {messages.isPending ? (
          <div className="space-y-3">
            <p role="status" className="sr-only">
              {t('conversation.loading')}
            </p>
            <Skeleton className="h-20 w-3/4" />
            <Skeleton className="ml-auto h-20 w-3/4" />
          </div>
        ) : messages.isError ? (
          <StateMessage
            tone="error"
            icon={TriangleAlert}
            title={getErrorMessage(
              messages.error,
              t('conversation.messagesError'),
            )}
            action={
              <Button variant="outline" onClick={() => void messages.refetch()}>
                {t('common:actions.retry')}
              </Button>
            }
          />
        ) : (
          <>
            {messages.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void messages.fetchNextPage()}
                  disabled={messages.isFetchingNextPage}
                >
                  {messages.isFetchingNextPage
                    ? t('conversation.loadingOlder')
                    : t('conversation.loadOlder')}
                </Button>
              </div>
            )}

            {items.length === 0 ? (
              <p className="text-muted-foreground">
                {t('conversation.noMessages')}
              </p>
            ) : (
              <ol className="space-y-3">
                {items.map((message) => (
                  <MessageItem
                    key={message._id}
                    message={message}
                    otherName={otherParticipant.name}
                  />
                ))}
              </ol>
            )}
          </>
        )}
      </section>

      <Card className="p-4 sm:p-6">
        <MessageForm
          id="reply"
          label={t('form.reply', { name: otherParticipant.name })}
          mutation={mutation}
        />
      </Card>
    </div>
  );
};

const ConversationPage = () => {
  const { id = '' } = useParams();
  const { t } = useTranslation('messages');
  const location = useLocation();
  const { data: currentUser, isPending: isUserPending } = useCurrentUser();

  const conversation = useQuery({
    queryKey: conversationQueryKeys.detail(id),
    queryFn: () => getConversation(id),
    enabled: Boolean(currentUser && id),
  });

  if (isUserPending) {
    return (
      <p role="status" className="sr-only">
        {t('conversation.loading')}
      </p>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (conversation.isPending) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <BackToMessages />
        <p role="status" className="sr-only">
          {t('conversation.loading')}
        </p>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </section>
    );
  }

  if (conversation.isError) {
    const { error } = conversation;
    const notFound =
      error instanceof ApiError && NOT_FOUND_CODES.includes(error.code);

    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <BackToMessages />
        {notFound ? (
          <>
            <h1 className="text-3xl sm:text-4xl">
              {t('conversation.notFound')}
            </h1>
            <StateMessage
              icon={SearchX}
              title={t('conversation.notFoundHint')}
            />
          </>
        ) : (
          <StateMessage
            tone="error"
            icon={TriangleAlert}
            title={getErrorMessage(error, t('conversation.error'))}
            action={
              <Button
                variant="outline"
                onClick={() => void conversation.refetch()}
              >
                {t('common:actions.retry')}
              </Button>
            }
          />
        )}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <BackToMessages />
      <PageHeader
        title={t('conversation.title', {
          name: conversation.data.otherParticipant.name,
        })}
      />
      <ConversationContext conversation={conversation.data} />
      <MessageThread conversation={conversation.data} />
    </section>
  );
};

export { ConversationPage };
