import type { RegisterInput, User } from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

export const register = async (input: RegisterInput): Promise<User> => {
  const { data } = await http.post<User>('/auth/register', input);
  return data;
};
