export const USER_NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * `user`: browses pets, posts pets (and owns them) and applies to adopt.
 * `admin`: additionally reaches the administration area (/api/admin).
 * Ownership of a pet is per pet, not a role. Roles are assigned only by an
 * admin or by the `admin:grant` command, never by registration.
 */
export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** A user as returned by the API. Never contains credentials. */
export type User = {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export type RegisterInput = {
  email: string;
  name: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};
