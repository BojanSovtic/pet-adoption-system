import { z } from 'zod';
import {
  PET_DESCRIPTION_MAX_LENGTH,
  PET_LIST_DEFAULT_PAGE_SIZE,
  PET_LIST_MAX_PAGE_SIZE,
  PET_NAME_MAX_LENGTH,
  PET_SEARCH_MAX_LENGTH,
  PET_SORT_OPTIONS,
  PET_SPECIES,
  PET_STATUSES,
  type CreatePetInput,
  type PetListQuery,
  type UpdatePetInput,
} from '@pet-adoption/models';

// `satisfies` makes the compiler fail if a schema drifts from the shared types.
export const createPetSchema = z.object({
  name: z.string().trim().min(1).max(PET_NAME_MAX_LENGTH),
  species: z.enum(PET_SPECIES),
  age: z.number().int().min(0),
  description: z.string().trim().min(1).max(PET_DESCRIPTION_MAX_LENGTH),
  // Defaulting to [] means an omitted field clears the images on PUT.
  imageUrls: z.array(z.url()).default([]),
}) satisfies z.ZodType<CreatePetInput>;

// PUT replaces all client-editable fields, so it validates the full shape.
export const updatePetSchema =
  createPetSchema satisfies z.ZodType<UpdatePetInput>;

// Query strings: an empty value (e.g. "?species=") means "not set".
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

/** Caps how deep offset pagination can skip (keeps `skip` cheap). */
const MAX_PAGE = 10_000;

/**
 * `GET /api/pets` query. Defaults guarantee a bounded page even when the
 * client sends nothing. Repeated parameters (`?species=a&species=b`) arrive
 * as arrays and are rejected; unknown parameters are ignored.
 */
export const petListQuerySchema = z.object({
  search: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(PET_SEARCH_MAX_LENGTH).optional(),
  ),
  species: z.preprocess(emptyToUndefined, z.enum(PET_SPECIES).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(PET_STATUSES).optional()),
  sort: z.preprocess(
    emptyToUndefined,
    z.enum(PET_SORT_OPTIONS).default('newest'),
  ),
  page: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  ),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(1)
      .max(PET_LIST_MAX_PAGE_SIZE)
      .default(PET_LIST_DEFAULT_PAGE_SIZE),
  ),
}) satisfies z.ZodType<PetListQuery>;

export type ParsedPetListQuery = z.output<typeof petListQuerySchema>;
