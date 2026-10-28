/** `rodent` covers hamsters, guinea pigs, rats, mice and similar. */
export const PET_SPECIES = [
  'dog',
  'cat',
  'rabbit',
  'bird',
  'rodent',
  'other',
] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

export const PET_SEXES = ['male', 'female', 'unknown'] as const;
export type PetSex = (typeof PET_SEXES)[number];

export const PET_BREED_MAX_LENGTH = 60;

/**
 * Lifestyle facts that help adopters judge whether a pet suits their home.
 * Each one has an explicit "unknown": owners often don't know, and an honest
 * "not sure" is better than a guess. Old records without these read as unknown.
 */
export const PET_COMPATIBILITY_TARGETS = ['children', 'dogs', 'cats'] as const;
export type PetCompatibilityTarget = (typeof PET_COMPATIBILITY_TARGETS)[number];

export const PET_COMPATIBILITY_VALUES = ['yes', 'no', 'unknown'] as const;
export type PetCompatibilityValue = (typeof PET_COMPATIBILITY_VALUES)[number];

/** Whether the pet gets along with children, dogs and cats. */
export type PetCompatibility = Record<
  PetCompatibilityTarget,
  PetCompatibilityValue
>;

/**
 * How long the pet is comfortable being left alone, shortest first:
 * `short` = up to about 2 hours, `part-day` = up to about 5 hours,
 * `full-day` = a working day. The order matters for filtering.
 */
export const PET_ALONE_TIMES = ['short', 'part-day', 'full-day'] as const;
export type PetAloneTimeKnown = (typeof PET_ALONE_TIMES)[number];
export type PetAloneTime = PetAloneTimeKnown | 'unknown';
export const PET_ALONE_TIME_VALUES = [...PET_ALONE_TIMES, 'unknown'] as const;

/** What a pet without the profile facts reads as. */
export const DEFAULT_PET_PROFILE = {
  sex: 'unknown',
  breed: '',
  compatibility: { children: 'unknown', dogs: 'unknown', cats: 'unknown' },
  aloneTime: 'unknown',
} as const satisfies PetProfile;

/** The profile facts of a pet (see DEFAULT_PET_PROFILE). */
export type PetProfile = {
  sex: PetSex;
  /** Free text such as "Labrador mix"; empty when not given. */
  breed: string;
  compatibility: PetCompatibility;
  aloneTime: PetAloneTime;
};

export const PET_STATUSES = ['available', 'pending', 'adopted'] as const;
export type PetStatus = (typeof PET_STATUSES)[number];

export const PET_NAME_MAX_LENGTH = 100;
export const PET_DESCRIPTION_MAX_LENGTH = 2000;

/**
 * Pet photos: up to `PET_IMAGE_MAX_COUNT` per pet, each at most
 * `PET_IMAGE_MAX_BYTES`. Added with `POST /api/pets/:id/images`, removed one
 * by one with `DELETE /api/pets/:id/images/:imageId`. The first photo is the
 * main one; `POST /api/pets/:id/images/:imageId/main` moves a photo to the front.
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
export type Pet = PetProfile & {
  _id: string;
  /** Id of the user who posted the pet; always set by the server. */
  owner: string;
  name: string;
  species: PetSpecies;
  age: number;
  description: string;
  status: PetStatus;
  /**
   * `true` when an admin hid the listing. Hidden pets are left out of the
   * public list and are only returned to their owner and to admins, so other
   * clients always see `false`.
   */
  hidden: boolean;
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

/**
 * The photo is not part of this input; it has its own endpoint. Profile facts
 * are optional (older clients don't send them); omitted ones are stored as
 * their DEFAULT_PET_PROFILE value.
 */
export type CreatePetInput = {
  name: string;
  species: PetSpecies;
  age: number;
  description: string;
  sex?: PetSex;
  breed?: string;
  compatibility?: Partial<PetCompatibility>;
  aloneTime?: PetAloneTime;
};

/**
 * `PUT` replaces every client-editable field, so it takes the same input as
 * create: an omitted profile fact is reset to its default. Photos, `status`
 * and timestamps are server-managed and never part of the input.
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
