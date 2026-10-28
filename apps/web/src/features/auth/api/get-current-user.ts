import type { User } from '@pet-adoption/models';

import { ApiError, http } from '../../../lib/api-client';

export const currentUserQueryKey = ['auth', 'me'] as const;

/** Returns the signed-in user, or `null` when there is no valid session. */
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const { data } = await http.get<User>('/auth/me');
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
      return null;
    }

    throw error;
  }
};
