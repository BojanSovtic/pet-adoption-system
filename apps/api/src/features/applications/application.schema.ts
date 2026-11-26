import { z } from 'zod';
import {
  APPLICATION_LIST_DEFAULT_PAGE_SIZE,
  APPLICATION_LIST_MAX_PAGE_SIZE,
  APPLICATION_MESSAGE_MAX_LENGTH,
  APPLICATION_REJECTION_REASON_MAX_LENGTH,
  APPLICATION_STATUSES,
  type ApplicationListQuery,
  type CreateApplicationInput,
  type MyApplicationListQuery,
  type ReceivedApplicationListQuery,
  type RejectApplicationInput,
} from '@pet-adoption/models';

import { emptyToUndefined } from '../../core/middleware/validate';

// Only the message comes from the client. Pet, applicant and status are set
// by the server; unknown fields are stripped.
export const createApplicationSchema = z.object({
  message: z.string().trim().min(1).max(APPLICATION_MESSAGE_MAX_LENGTH),
}) satisfies z.ZodType<CreateApplicationInput>;

// Rejecting needs the owner's explanation for the applicant. Trimmed before
// the length check, so a reason of only spaces counts as missing.
export const rejectApplicationSchema = z.object({
  reason: z.string().trim().min(1).max(APPLICATION_REJECTION_REASON_MAX_LENGTH),
}) satisfies z.ZodType<RejectApplicationInput>;

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

/**
 * `/applications/received` can be narrowed to one status (the pending count
 * and the "waiting for a decision" filter).
 */
export const receivedApplicationListQuerySchema =
  applicationListQuerySchema.extend({
    status: z.preprocess(
      emptyToUndefined,
      z.enum(APPLICATION_STATUSES).optional(),
    ),
  }) satisfies z.ZodType<ReceivedApplicationListQuery>;

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
export type ParsedReceivedApplicationListQuery = z.output<
  typeof receivedApplicationListQuerySchema
>;
export type ParsedMyApplicationListQuery = z.output<
  typeof myApplicationListQuerySchema
>;
