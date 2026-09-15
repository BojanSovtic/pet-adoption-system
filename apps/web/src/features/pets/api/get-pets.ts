import { apiClient } from '../../../lib/api-client';

export interface Pet {
  _id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  age: number;
  description: string;
  status: 'available' | 'pending' | 'adopted';
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export const getPets = async (): Promise<Pet[]> => {
  return apiClient<Pet[]>('/pets');
};
