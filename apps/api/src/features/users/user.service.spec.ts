import { Types } from 'mongoose';

import { UserModel } from './user.model';
import {
  createUser,
  findAuthState,
  isEmailVerified,
  toPublicUser,
} from './user.service';

/**
 * Inserts a user past Mongoose, the way a document stored before email
 * verification existed looks: no `emailVerifiedAt` field at all.
 */
const insertLegacyUser = async (): Promise<Types.ObjectId> => {
  const _id = new Types.ObjectId();
  const now = new Date();

  await UserModel.collection.insertOne({
    _id,
    email: 'legacy@example.com',
    name: 'Legacy User',
    role: 'user',
    suspendedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return _id;
};

describe('isEmailVerified', () => {
  it('is false only for an explicit null', () => {
    expect(isEmailVerified({ emailVerifiedAt: null })).toBe(false);
    expect(isEmailVerified({ emailVerifiedAt: new Date() })).toBe(true);
    expect(isEmailVerified({})).toBe(true);
  });
});

describe('createUser', () => {
  it('creates an unconfirmed user', async () => {
    const user = await createUser({
      email: 'new@example.com',
      name: 'New User',
      passwordHash: 'hash',
    });

    expect(user.emailVerifiedAt).toBeNull();
    expect(toPublicUser(user).emailVerified).toBe(false);
  });
});

describe('findAuthState', () => {
  it('reports an unconfirmed new user', async () => {
    const user = await createUser({
      email: 'new@example.com',
      name: 'New User',
      passwordHash: 'hash',
    });

    expect(await findAuthState(user._id.toString())).toEqual({
      role: 'user',
      suspended: false,
      emailVerified: false,
    });
  });

  it('reports a confirmed user', async () => {
    const user = await createUser({
      email: 'new@example.com',
      name: 'New User',
      passwordHash: 'hash',
    });
    await UserModel.updateOne(
      { _id: user._id },
      { emailVerifiedAt: new Date() },
    );

    expect(await findAuthState(user._id.toString())).toMatchObject({
      emailVerified: true,
    });
  });

  it('treats a user without the field as confirmed', async () => {
    const id = await insertLegacyUser();

    expect(await findAuthState(id.toString())).toEqual({
      role: 'user',
      suspended: false,
      emailVerified: true,
    });
  });
});

// A schema default of `null` would break legacy users here: Mongoose fills
// defaults into the documents it loads (and then saves them).
describe('legacy documents loaded through Mongoose', () => {
  it('keep the field missing when hydrated', async () => {
    const id = await insertLegacyUser();

    const user = await UserModel.findById(id).orFail();

    expect(user.emailVerifiedAt).toBeUndefined();
    expect(user.toObject()).not.toHaveProperty('emailVerifiedAt');
    expect(toPublicUser(user.toObject()).emailVerified).toBe(true);
  });

  it('keep the field missing after an unrelated save', async () => {
    const id = await insertLegacyUser();

    const user = await UserModel.findById(id).orFail();
    user.name = 'Renamed User';
    await user.save();

    const stored = await UserModel.collection.findOne({ _id: id });

    expect(stored?.name).toBe('Renamed User');
    expect(stored).not.toHaveProperty('emailVerifiedAt');
  });

  it('keep the field missing after an admin-style update', async () => {
    const id = await insertLegacyUser();

    // The same options as `updateUser` in admin/user-role.service.ts.
    const user = await UserModel.findByIdAndUpdate(
      id,
      { suspendedAt: new Date() },
      { returnDocument: 'after', runValidators: true },
    ).lean();

    expect(user).not.toHaveProperty('emailVerifiedAt');
    expect(await findAuthState(id.toString())).toMatchObject({
      emailVerified: true,
    });
  });
});
