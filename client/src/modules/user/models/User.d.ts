import { PetDTO } from "@/modules/pets/models/Pets";

export type UserRole = "user" | "shelter" | "admin";
export interface Address {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
}
export interface UserDTO {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  role: UserRole;
  isEmailVerified: boolean;
  isActive: boolean;
  pets: PetDTO[];
  favoritePets: PetDTO[];
  adoptionApplications: any[]; // TODO
  petCount: number;
  createdAt?: string;
  updatedAt?: string;
}
export interface UserView {
  id: string;
  name: string;
  email?: string;
  avatar?: string | null;
  role?: UserRole;
  petCount?: number;
}
