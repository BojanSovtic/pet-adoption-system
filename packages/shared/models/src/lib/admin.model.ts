import type {
  ApplicantSummary,
  ApplicationPetSummary,
  ApplicationStatus,
} from './adoption-application.model.js';
import type { Pet, PetListQuery, PetStatus } from './pet.model.js';
import type { User, UserRole } from './user.model.js';

/**
 * Types of the administration API (`/api/admin`, admins only). Responses
 * contain only what the admin pages show: no password hashes, sessions or
 * application messages.
 */

/** A user's identity as shown next to pets and applications. */
export type UserSummary = Pick<User, '_id' | 'name' | 'email'>;

export const ADMIN_LIST_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_LIST_MAX_PAGE_SIZE = 50;
export const ADMIN_SEARCH_MAX_LENGTH = 100;

/** Optional note an admin adds to a suspension or a hidden listing. */
export const MODERATION_REASON_MAX_LENGTH = 500;

/** `GET /api/admin/stats`: platform counts plus the latest admin changes. */
export type AdminStats = {
  users: { total: number; admins: number; suspended: number };
  pets: { total: number; hidden: number } & Record<PetStatus, number>;
  applications: { total: number } & Record<ApplicationStatus, number>;
  /** The most recent audited admin *changes* (no read events), newest first. */
  recentActivity: AdminAuditEntry[];
};

/** A user in the admin list, with how active they are. */
export type AdminUser = User & {
  /** Pets this user posted. */
  petCount: number;
  /** Adoption applications this user submitted. */
  applicationCount: number;
  /** When an admin suspended the account; `null` while active. */
  suspendedAt: string | null;
};

export const ADMIN_USER_STATUSES = ['active', 'suspended'] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

/** `GET /api/admin/users`: search matches name or email (contains, any case). */
export type AdminUserListQuery = {
  search?: string;
  role?: UserRole;
  status?: AdminUserStatus;
  page?: number;
  pageSize?: number;
};

/** `PUT /api/admin/users/:id/role` */
export type UpdateUserRoleInput = {
  role: UserRole;
};

/**
 * Body of the moderation actions (`POST /api/admin/users/:id/suspend`,
 * `POST /api/admin/pets/:id/hide`). The reason is kept in the audit log.
 */
export type ModerationInput = {
  reason?: string;
};

/** `GET /api/admin/pets`: the pet list (hidden pets included) plus owners. */
export type AdminPet = Pet & {
  /** `null` for pets created before ownership existed. */
  ownerDetails: UserSummary | null;
  /** When an admin hid the listing; `null` while public. */
  hiddenAt: string | null;
};

export const ADMIN_PET_VISIBILITIES = ['visible', 'hidden'] as const;
export type AdminPetVisibility = (typeof ADMIN_PET_VISIBILITIES)[number];

/** The public list parameters, plus hidden/visible. */
export type AdminPetListQuery = PetListQuery & {
  visibility?: AdminPetVisibility;
};

/**
 * `GET /api/admin/applications`: who applied for which pet and its status.
 * The applicant's message is left out on purpose (not needed for oversight).
 */
export type AdminApplication = {
  _id: string;
  status: ApplicationStatus;
  pet: ApplicationPetSummary;
  applicant: ApplicantSummary;
  owner: UserSummary;
  createdAt: string;
  updatedAt: string;
};

export type AdminApplicationListQuery = {
  status?: ApplicationStatus;
  page?: number;
  pageSize?: number;
};

/** How an audited action was made: in the admin area or with the CLI. */
export const ADMIN_AUDIT_SOURCES = ['admin-ui', 'cli'] as const;
export type AdminAuditSource = (typeof ADMIN_AUDIT_SOURCES)[number];

/** Changes: consequential admin actions. */
export const ADMIN_CHANGE_ACTIONS = [
  'user.role.changed',
  'user.suspended',
  'user.reinstated',
  'pet.hidden',
  'pet.restored',
] as const;

/** Reads of lists that show other people's names and email addresses. */
export const ADMIN_READ_ACTIONS = [
  'users.viewed',
  'pets.viewed',
  'applications.viewed',
] as const;

export const ADMIN_AUDIT_ACTIONS = [
  ...ADMIN_CHANGE_ACTIONS,
  ...ADMIN_READ_ACTIONS,
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

/** `denied`: an admin tried a change that the rules refused (e.g. LAST_ADMIN). */
export const ADMIN_AUDIT_OUTCOMES = ['succeeded', 'denied'] as const;
export type AdminAuditOutcome = (typeof ADMIN_AUDIT_OUTCOMES)[number];

/**
 * Small, non-sensitive details. Never passwords, tokens, messages or search
 * text (a search can contain someone's email); `search` only says whether a
 * search was used.
 */
export type AdminAuditMetadata = {
  from?: UserRole;
  to?: UserRole;
  reason?: string;
  /** The error code of a denied action. */
  code?: string;
  page?: number;
  search?: boolean;
  filters?: string[];
  resultCount?: number;
};

/** One audited admin action. */
export type AdminAuditEntry = {
  _id: string;
  /** Position in the tamper-evident chain (1, 2, 3, …). */
  seq: number;
  action: AdminAuditAction;
  outcome: AdminAuditOutcome;
  /** The admin who acted; `null` for the CLI (an operator with database access). */
  actor: UserSummary | null;
  /** The affected user (role, suspension) or `null` for other targets. */
  targetUser: UserSummary | null;
  /** The affected pet (moderation); `null` for other targets. */
  targetPet: { _id: string; name: string } | null;
  metadata: AdminAuditMetadata;
  source: AdminAuditSource;
  createdAt: string;
};

/** `GET /api/admin/audit` */
export type AdminAuditListQuery = {
  action?: AdminAuditAction;
  page?: number;
  pageSize?: number;
};
