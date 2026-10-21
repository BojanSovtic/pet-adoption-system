import type { Pet } from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

/** Uploads (or replaces) the pet's photo. */
export const uploadPetImage = async (
  petId: string,
  file: File,
): Promise<Pet> => {
  const body = new FormData();
  body.append('image', file);

  const { data } = await http.put<Pet>(`/pets/${petId}/image`, body);
  return data;
};

export const deletePetImage = async (petId: string): Promise<Pet> => {
  const { data } = await http.delete<Pet>(`/pets/${petId}/image`);
  return data;
};
