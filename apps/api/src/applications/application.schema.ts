import { z } from 'zod';
import {
  APPLICATION_MESSAGE_MAX_LENGTH,
  type CreateApplicationInput,
} from '@pet-adoption/models';

// Only the message comes from the client. Pet, applicant and status are set
// by the server; unknown fields are stripped.
export const createApplicationSchema = z.object({
  message: z.string().trim().min(1).max(APPLICATION_MESSAGE_MAX_LENGTH),
}) satisfies z.ZodType<CreateApplicationInput>;
