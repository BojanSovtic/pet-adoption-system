export interface PetEntity {
  _id: string;
  name: string;
  species?: string;
  breed?: string;
  age?: string;
  description?: string;
  photos?: string[];
  status?: "available" | "adopted";
  owner?: string | UserEntity | null; // owner may be id or populated UserEntity
  adopter?: string | UserEntity | null; // idem
  createdAt?: string;
  updatedAt?: string;
}

export interface PetView {
  _id: string;
  name: string;
  species?: string;
  breed?: string;
  age?: string;
  description?: string;
  photos?: string[];
  status?: "available" | "adopted";
  owner?: string | UserEntity | null; // owner may be id or populated UserEntity
  adopter?: string | UserEntity | null; // idem
  createdAt?: string;
  updatedAt?: string;
}
