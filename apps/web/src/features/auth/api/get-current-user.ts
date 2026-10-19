import type { User } from '@pet-adoption/models';

import { ApiError, apiClient } from '../../../lib/api-client';

export const currentUserQueryKey = ['auth', 'me'] as const;

/** Returns the signed-in user, or `null` when there is no valid session. */
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    return await apiClient<User>('/auth/me');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
      return null;
    }

    throw error;
  }
};
