import { http } from '../../../lib/api-client';

export const deletePet = async (id: string): Promise<void> => {
  await http.delete(`/pets/${id}`);
};
