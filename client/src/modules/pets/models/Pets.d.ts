export interface Pet {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  age?: number;
  description?: string;
  photos: string[];
  status: 'available' | 'adopted';
  owner: string;
  adopter?: string;
}