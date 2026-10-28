import { z } from 'zod';
import {
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
  ADMIN_LIST_MAX_PAGE_SIZE,
  ADMIN_AUDIT_ACTIONS,
  ADMIN_PET_VISIBILITIES,
  ADMIN_SEARCH_MAX_LENGTH,
  ADMIN_USER_STATUSES,
  APPLICATION_STATUSES,
  MODERATION_REASON_MAX_LENGTH,
  USER_ROLES,
  type AdminApplicationListQuery,
  type AdminAuditListQuery,
  type AdminUserListQuery,
  type ModerationInput,
  type UpdateUserRoleInput,
} from '@pet-adoption/models';

import { petListQuerySchema } from '../pets/pet.schema';

// Query strings: an empty value (e.g. "?role=") means "not set".
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

/** Caps how deep offset pagination can skip (keeps `skip` cheap). */
const MAX_PAGE = 10_000;

// Repeated parameters arrive as arrays and are rejected; unknown ones are ignored.
const paging = {
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
      .max(ADMIN_LIST_MAX_PAGE_SIZE)
      .default(ADMIN_LIST_DEFAULT_PAGE_SIZE),
  ),
};

export const adminUserListQuerySchema = z.object({
  search: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(ADMIN_SEARCH_MAX_LENGTH).optional(),
  ),
  role: z.preprocess(emptyToUndefined, z.enum(USER_ROLES).optional()),
  status: z.preprocess(
    emptyToUndefined,
    z.enum(ADMIN_USER_STATUSES).optional(),
  ),
  ...paging,
}) satisfies z.ZodType<AdminUserListQuery>;

export type ParsedAdminUserListQuery = z.output<
  typeof adminUserListQuerySchema
>;

export const adminApplicationListQuerySchema = z.object({
  status: z.preprocess(
    emptyToUndefined,
    z.enum(APPLICATION_STATUSES).optional(),
  ),
  ...paging,
}) satisfies z.ZodType<AdminApplicationListQuery>;

// Only the role; unknown fields (e.g. an id) are stripped, so the target user
// always comes from the URL and the actor from the session.
export const updateUserRoleSchema = z.object({
  role: z.enum(USER_ROLES),
}) satisfies z.ZodType<UpdateUserRoleInput>;

/** The public pet list parameters plus `visibility` (default: all pets). */
export const adminPetListQuerySchema = petListQuerySchema.extend({
  visibility: z.preprocess(
    emptyToUndefined,
    z.enum(ADMIN_PET_VISIBILITIES).optional(),
  ),
});

export type ParsedAdminPetListQuery = z.output<typeof adminPetListQuerySchema>;

export const adminAuditListQuerySchema = z.object({
  action: z.preprocess(
    emptyToUndefined,
    z.enum(ADMIN_AUDIT_ACTIONS).optional(),
  ),
  ...paging,
}) satisfies z.ZodType<AdminAuditListQuery>;

// Suspend and hide: an optional note, kept in the audit log. Trimmed; an
// empty note counts as none.
export const moderationSchema = z.object({
  reason: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(MODERATION_REASON_MAX_LENGTH).optional(),
  ),
}) satisfies z.ZodType<ModerationInput>;
