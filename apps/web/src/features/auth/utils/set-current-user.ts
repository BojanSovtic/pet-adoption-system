import type { QueryClient } from '@tanstack/react-query';
import type { User } from '@pet-adoption/models';

import { applicationQueryKeys } from '../../applications/api/applications';
import { currentUserQueryKey } from '../api/get-current-user';

/**
 * Use for every identity change (sign-in, sign-out, expired session). Cached
 * data that belongs to a user is removed first, so the next user never sees
 * the previous user's applications.
 */
export const setCurrentUser = (
  queryClient: QueryClient,
  user: User | null,
): void => {
  queryClient.removeQueries({ queryKey: applicationQueryKeys.all });
  queryClient.setQueryData(currentUserQueryKey, user);
};
