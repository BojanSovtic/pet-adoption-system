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
  imageUrls: z.array(z.url()).optional(),
}) satisfies z.ZodType<CreatePetInput>;

export const updatePetSchema =
  createPetSchema.partial() satisfies z.ZodType<UpdatePetInput>;
