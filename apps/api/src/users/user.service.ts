import { mongo, type Types } from 'mongoose';
import type { User } from '@pet-adoption/models';

import { ConflictError } from '../errors/app-error';
import { UserModel, type UserRecord } from './user.model';

type StoredUser = UserRecord & { _id: Types.ObjectId };

type CreateUserInput = Pick<UserRecord, 'email' | 'name' | 'passwordHash'>;

const DUPLICATE_KEY_ERROR = 11000;

export const createUser = async (
  input: CreateUserInput,
): Promise<StoredUser> => {
  try {
    const user = await UserModel.create(input);

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
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});
