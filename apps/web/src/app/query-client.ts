import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { currentUserQueryKey } from '../features/auth/api/get-current-user';
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

/** A request failed because the session expired or was ended elsewhere. */
const handleUnauthenticated = (error: Error) => {
  if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
    queryClient.setQueryData(currentUserQueryKey, null);
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
