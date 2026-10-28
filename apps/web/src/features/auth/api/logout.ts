import { http } from '../../../lib/api-client';

export const logout = async (): Promise<void> => {
  await http.post('/auth/logout');
};
