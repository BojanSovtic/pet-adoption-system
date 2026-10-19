import { z } from 'zod';
import {
  PET_DESCRIPTION_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  PET_SPECIES,
  type CreatePetInput,
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
