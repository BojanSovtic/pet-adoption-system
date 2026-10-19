export const PET_SPECIES = ['dog', 'cat', 'other'] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

export const PET_STATUSES = ['available', 'pending', 'adopted'] as const;
export type PetStatus = (typeof PET_STATUSES)[number];

export const PET_NAME_MAX_LENGTH = 100;
export const PET_DESCRIPTION_MAX_LENGTH = 2000;

/** A pet as returned by the API (JSON: ids and dates are strings). */
export type Pet = {
  _id: string;
  name: string;
  species: PetSpecies;
  age: number;
  description: string;
  status: PetStatus;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreatePetInput = {
  name: string;
  species: PetSpecies;
  age: number;
  description: string;
  imageUrls?: string[];
};

export type UpdatePetInput = Partial<CreatePetInput>;
