import type { Pet } from '@pet-adoption/models';

import { apiClient } from '../../../lib/api-client';

/** Uploads (or replaces) the pet's photo. */
export const uploadPetImage = async (
  petId: string,
  file: File,
): Promise<Pet> => {
  const body = new FormData();
  body.append('image', file);

  return apiClient<Pet>(`/pets/${petId}/image`, { method: 'PUT', body });
};

export const deletePetImage = async (petId: string): Promise<Pet> => {
  return apiClient<Pet>(`/pets/${petId}/image`, { method: 'DELETE' });
};
