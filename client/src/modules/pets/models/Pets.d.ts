export interface PetDTO {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  age?: string;
  description?: string;
  images?: string[];
  status?: "available" | "adopted";
  owner?: string | UserEntity | null;
  adopter?: string | UserEntity | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PetView {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  age?: string;
  description?: string;
  images?: string[];
  status?: "available" | "adopted";
  owner?: string | UserEntity | null;
  adopter?: string | UserEntity | null;
  createdAt?: string;
  updatedAt?: string;
}
