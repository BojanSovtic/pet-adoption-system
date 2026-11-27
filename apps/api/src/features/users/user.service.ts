import { mongo, type Types } from 'mongoose';
import type { PublicUserProfile, User, UserRole } from '@pet-adoption/models';

import { ConflictError } from '../../core/errors/app-error';
import { UserModel, type UserRecord } from './user.model';

type StoredUser = UserRecord & { _id: Types.ObjectId };

// No `role`: every new account is an ordinary user. Roles change only
// through changeUserRole (admin area or the admin:grant command).
type CreateUserInput = Pick<UserRecord, 'email' | 'name' | 'passwordHash'>;

const DUPLICATE_KEY_ERROR = 11000;

export const createUser = async (
  input: CreateUserInput,
): Promise<StoredUser> => {
  try {
    const { email, name, passwordHash } = input;
    // An explicit `null` (not a missing field) marks the account as
    // unconfirmed; see `isEmailVerified`.
    const user = await UserModel.create({
      email,
      name,
      passwordHash,
      emailVerifiedAt: null,
    });

    return user.toObject();
  } catch (error) {
    // The unique index makes this race-safe, unlike checking before inserting.
    if (
      error instanceof mongo.MongoServerError &&
      error.code === DUPLICATE_KEY_ERROR
    ) {
      throw new ConflictError('EMAIL_ALREADY_REGISTERED');
    }

    throw error;
  }
};

/**
 * The one place that decides whether an email address counts as confirmed:
 * only an explicit `null` means "not yet". A missing field is an account from
 * before verification existed and counts as confirmed. So every query that
 * feeds this must load `emailVerifiedAt`: a projection that leaves it out
 * would make an unconfirmed user look confirmed.
 */
export const isEmailVerified = (
  user: Pick<UserRecord, 'emailVerifiedAt'>,
): boolean => user.emailVerifiedAt !== null;

export const findUserById = async (id: string): Promise<StoredUser | null> => {
  return UserModel.findById(id).lean();
};

/**
 * Read from the database on every call, never from the session, so a role
 * change applies to the user's very next request.
 */
export const isAdmin = async (id: string): Promise<boolean> => {
  return (await UserModel.exists({ _id: id, role: 'admin' })) !== null;
};

/**
 * What authorization needs about a signed-in user, read on every request so
 * role changes, suspensions and email confirmation apply at once. `null` if
 * the user is gone. A missing role counts as `user`.
 */
export const findAuthState = async (
  id: string,
): Promise<{
  role: UserRole;
  suspended: boolean;
  emailVerified: boolean;
} | null> => {
  const user = await UserModel.findById(
    id,
    'role suspendedAt emailVerifiedAt',
  ).lean();

  return user
    ? {
        role: user.role ?? 'user',
        suspended: Boolean(user.suspendedAt),
        emailVerified: isEmailVerified(user),
      }
    : null;
};

/** The only query that loads the password hash; use it for sign-in only. */
export const findUserByEmailWithPasswordHash = async (
  email: string,
): Promise<StoredUser | null> => {
  return UserModel.findOne({ email }).select('+passwordHash').lean();
};

/** Maps a stored user to the public API shape, dropping credentials. */
export const toPublicUser = (user: StoredUser): User => ({
  _id: user._id.toString(),
  email: user.email,
  name: user.name,
  role: user.role ?? 'user',
  emailVerified: isEmailVerified(user),
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

/**
 * What other signed-in users may see about a user: the name and when the
 * account was created. Only these fields are read from the database, so
 * nothing private can leak into the response by accident.
 */
export const findPublicProfile = async (
  id: string,
): Promise<PublicUserProfile | null> => {
  const user = await UserModel.findById(id, 'name createdAt').lean();

  return user
    ? {
        _id: user._id.toString(),
        name: user.name,
        memberSince: user.createdAt.toISOString(),
      }
    : null;
};
