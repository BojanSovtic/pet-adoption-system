import { mongo, type Types } from 'mongoose';
import type { User, UserRole } from '@pet-adoption/models';

import { ConflictError } from '../errors/app-error';
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
    const user = await UserModel.create({ email, name, passwordHash });

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
 * role changes and suspensions apply at once. `null` if the user is gone.
 * A missing role counts as `user`.
 */
export const findAuthState = async (
  id: string,
): Promise<{ role: UserRole; suspended: boolean } | null> => {
  const user = await UserModel.findById(id, 'role suspendedAt').lean();

  return user
    ? { role: user.role ?? 'user', suspended: Boolean(user.suspendedAt) }
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
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});
