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

/**
 * `PUT` replaces every client-editable field, so it takes the same input as
 * create. Omitted `imageUrls` means "no images". `status` and timestamps are
 * server-managed and never part of the input.
 */
export type UpdatePetInput = CreatePetInput;
