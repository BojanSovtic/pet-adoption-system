import type { LoginInput, User } from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

export const login = async (input: LoginInput): Promise<User> => {
  const { data } = await http.post<User>('/auth/login', input);
  return data;
};
