import { apiClient } from '../../../lib/api-client';

export const logout = async (): Promise<void> => {
  return apiClient<void>('/auth/logout', { method: 'POST' });
};
