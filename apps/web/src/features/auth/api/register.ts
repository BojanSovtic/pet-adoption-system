import type { RegisterInput, User } from '@pet-adoption/models';

import { apiClient } from '../../../lib/api-client';

export const register = async (input: RegisterInput): Promise<User> => {
  return apiClient<User>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
};
