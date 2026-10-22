export const PET_SPECIES = ['dog', 'cat', 'other'] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

export const PET_STATUSES = ['available', 'pending', 'adopted'] as const;
export type PetStatus = (typeof PET_STATUSES)[number];

export const PET_NAME_MAX_LENGTH = 100;
export const PET_DESCRIPTION_MAX_LENGTH = 2000;

/**
 * Pet photos: up to `PET_IMAGE_MAX_COUNT` per pet, each at most
 * `PET_IMAGE_MAX_BYTES`. Added with `POST /api/pets/:id/images`, removed one
 * by one with `DELETE /api/pets/:id/images/:imageId`.
 */
export const PET_IMAGE_MAX_COUNT = 5;
export const PET_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PET_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type PetImageType = (typeof PET_IMAGE_TYPES)[number];

/** One photo of a pet. `_id` identifies it for removal. */
export type PetImage = {
  _id: string;
  url: string;
};

/** A pet as returned by the API (JSON: ids and dates are strings). */
export type Pet = {
  _id: string;
  /** Id of the user who posted the pet; always set by the server. */
  owner: string;
  name: string;
  species: PetSpecies;
  age: number;
  description: string;
  status: PetStatus;
  /**
   * Public URL of the pet's primary (first) photo, or `null` if it has none.
   * Kept next to `images` so lists and older clients need only one field.
   */
  imageUrl: string | null;
  /** All photos in display order, the primary one first; may be empty. */
  images: PetImage[];
  createdAt: string;
  updatedAt: string;
};

/** The photo is not part of this input; it has its own endpoint. */
export type CreatePetInput = {
  name: string;
  species: PetSpecies;
  age: number;
  description: string;
};

/**
 * `PUT` replaces every client-editable field, so it takes the same input as
 * create. Omitted `imageUrls` means "no images". `status` and timestamps are
 * server-managed and never part of the input.
 */
export type UpdatePetInput = CreatePetInput;

/** Sort options for the pet list. Named options form the whitelist. */
export const PET_SORT_OPTIONS = ['newest', 'oldest', 'name', 'age'] as const;
export type PetSort = (typeof PET_SORT_OPTIONS)[number];

export const PET_LIST_DEFAULT_PAGE_SIZE = 12;
export const PET_LIST_MAX_PAGE_SIZE = 50;
export const PET_SEARCH_MAX_LENGTH = 100;

/** Query parameters of `GET /api/pets`. Omitted values use the defaults. */
export type PetListQuery = {
  search?: string;
  species?: PetSpecies;
  status?: PetStatus;
  sort?: PetSort;
  page?: number;
  pageSize?: number;
};

/** One page of results plus what the UI needs to render paging controls. */
export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};
