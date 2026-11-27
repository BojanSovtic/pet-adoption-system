import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '../../auth/hooks/use-current-user';
import {
  applicationQueryKeys,
  getPendingApplicationCount,
} from '../api/applications';

/**
 * The signed-in user's pending applications for their pets, as a number, or
 * `undefined` while loading, after an error or when signed out. A hint only:
 * a failure shows no badge rather than an error toast. It refreshes after
 * every application action (they invalidate `applicationQueryKeys.all`) and
 * when the window regains focus; there is no polling or push.
 */
export const usePendingApplicationCount = (): number | undefined => {
  const { data: currentUser } = useCurrentUser();
  const { data } = useQuery({
    queryKey: applicationQueryKeys.pendingCount,
    queryFn: getPendingApplicationCount,
    enabled: Boolean(currentUser),
    meta: { skipGlobalErrorToast: true },
  });

  return currentUser ? data : undefined;
};
