import { apiClient } from '../../../lib/api-client';
import type { Pet } from './get-pets';

export type CreatePetInput = {
  name: string;
  species: Pet['species'];
  age: number;
  description: string;
  imageUrls?: string[];
};

export const createPet = async (input: CreatePetInput): Promise<Pet> => {
  return apiClient<Pet>('/pets', {
    method: 'POST',
    body: JSON.stringify(input),
  });
};
