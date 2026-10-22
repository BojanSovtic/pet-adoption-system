import type { Pet } from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

/** Adds photos after the pet's existing ones (at most 5 in total). */
export const addPetImages = async (
  petId: string,
  files: File[],
): Promise<Pet> => {
  const body = new FormData();

  for (const file of files) {
    body.append('images', file);
  }

  const { data } = await http.post<Pet>(`/pets/${petId}/images`, body);
  return data;
};

/** Removes one photo. */
export const deletePetImage = async (
  petId: string,
  imageId: string,
): Promise<Pet> => {
  const { data } = await http.delete<Pet>(`/pets/${petId}/images/${imageId}`);
  return data;
};
