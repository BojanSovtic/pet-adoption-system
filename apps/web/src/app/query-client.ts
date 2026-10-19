import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { i18n } from '../i18n/config';

const showGlobalErrorToast = (meta?: Record<string, unknown>) => {
  if (meta?.skipGlobalErrorToast === true) {
    return;
  }

  toast.error(i18n.t('common:unexpectedError'));
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (_error, query) => {
      showGlobalErrorToast(query.meta);
    },
  }),

  mutationCache: new MutationCache({
    onError: (_error, _variables, _context, mutation) => {
      showGlobalErrorToast(mutation.meta);
    },
  }),
});
