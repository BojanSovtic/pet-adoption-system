import { z } from 'zod';
import {
  APPLICATION_LIST_DEFAULT_PAGE_SIZE,
  APPLICATION_LIST_MAX_PAGE_SIZE,
  APPLICATION_MESSAGE_MAX_LENGTH,
  type ApplicationListQuery,
  type CreateApplicationInput,
  type MyApplicationListQuery,
} from '@pet-adoption/models';

// Only the message comes from the client. Pet, applicant and status are set
// by the server; unknown fields are stripped.
export const createApplicationSchema = z.object({
  message: z.string().trim().min(1).max(APPLICATION_MESSAGE_MAX_LENGTH),
}) satisfies z.ZodType<CreateApplicationInput>;

// Query strings: an empty value (e.g. "?page=") means "not set".
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

/** Caps how deep offset pagination can skip (keeps `skip` cheap). */
const MAX_PAGE = 10_000;

/**
 * Paging for both application lists. Repeated parameters arrive as arrays and
 * are rejected; unknown parameters are ignored.
 */
export const applicationListQuerySchema = z.object({
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
      .max(APPLICATION_LIST_MAX_PAGE_SIZE)
      .default(APPLICATION_LIST_DEFAULT_PAGE_SIZE),
  ),
}) satisfies z.ZodType<ApplicationListQuery>;

/** `/applications/mine` can be narrowed to one pet (used by the pet page). */
export const myApplicationListQuerySchema = applicationListQuerySchema.extend({
  pet: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[0-9a-f]{24}$/i)
      .optional(),
  ),
}) satisfies z.ZodType<MyApplicationListQuery>;

export type ParsedApplicationListQuery = z.output<
  typeof applicationListQuerySchema
>;
export type ParsedMyApplicationListQuery = z.output<
  typeof myApplicationListQuerySchema
>;
