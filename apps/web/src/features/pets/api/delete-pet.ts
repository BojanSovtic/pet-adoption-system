import { apiClient } from '../../../lib/api-client';

export const deletePet = async (id: string): Promise<void> => {
  return apiClient<void>(`/pets/${id}`, {
    method: 'DELETE',
  });
};
