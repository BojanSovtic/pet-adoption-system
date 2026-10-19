import type { LoginInput, User } from '@pet-adoption/models';

import { apiClient } from '../../../lib/api-client';

export const login = async (input: LoginInput): Promise<User> => {
  return apiClient<User>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
};
