import { z } from 'zod';

export const createPetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  species: z.enum(['dog', 'cat', 'other']),
  age: z.number().int().min(0),
  description: z.string().trim().min(1).max(2000),
  imageUrls: z.array(z.url()).optional(),
});

export const updatePetSchema = createPetSchema.partial();

export type CreatePetRequest = z.infer<typeof createPetSchema>;
export type UpdatePetRequest = z.infer<typeof updatePetSchema>;
