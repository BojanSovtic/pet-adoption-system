import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { currentUserQueryKey } from '../features/auth/api/get-current-user';
import { setCurrentUser } from '../features/auth/utils/set-current-user';
import { ApiError } from '../lib/api-client';
import { getErrorMessage } from '../lib/get-error-message';

type AppMeta = {
  /** Set when the query/mutation displays its own error UI. */
  skipGlobalErrorToast?: boolean;
};

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: AppMeta;
    mutationMeta: AppMeta;
  }
}

const MAX_RETRIES = 3;

/** Client errors (4xx) won't succeed on retry; network and 5xx errors might. */
export const shouldRetry = (failureCount: number, error: Error): boolean => {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }

  return failureCount < MAX_RETRIES;
};

/**
 * Identity changes the API reports on any request:
 * - the session expired, was ended elsewhere, or the account was suspended
 *   (the API ended the session): the user is now signed out;
 * - the user is no longer an admin: the cached user (and its role) is stale,
 *   so refetch it and the admin navigation disappears.
 */
const handleUnauthenticated = (error: Error) => {
  if (!(error instanceof ApiError)) {
    return;
  }

  // A suspended account's session was ended by the API: signed out now.
  if (error.code === 'UNAUTHENTICATED' || error.code === 'ACCOUNT_SUSPENDED') {
    setCurrentUser(queryClient, null);
  }

  if (error.code === 'ADMIN_REQUIRED') {
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  }
};

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
    },
  },

  queryCache: new QueryCache({
    onError: (error, query) => {
      handleUnauthenticated(error);

      // Initial load errors are rendered by the page itself. Only toast when a
      // background refetch fails, because the page still shows the old data.
      if (query.state.data === undefined || query.meta?.skipGlobalErrorToast) {
        return;
      }

      toast.error(getErrorMessage(error));
    },
  }),

  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      handleUnauthenticated(error);

      if (mutation.meta?.skipGlobalErrorToast) {
        return;
      }

      toast.error(getErrorMessage(error));
    },
  }),
});
