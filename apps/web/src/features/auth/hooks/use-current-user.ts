import { useQuery } from '@tanstack/react-query';

import { currentUserQueryKey, getCurrentUser } from '../api/get-current-user';

/**
 * The signed-in user (`null` when signed out, `undefined` while loading).
 * Login, register, logout and 401 responses update this cache entry directly.
 */
export const useCurrentUser = () =>
  useQuery({
    queryKey: currentUserQueryKey,
    queryFn: getCurrentUser,
  });
