import type { LoginInput, RegisterInput } from '@pet-adoption/models';

import { ForbiddenError, UnauthorizedError } from '../errors/app-error';
import {
  createUser,
  findUserByEmailWithPasswordHash,
} from '../users/user.service';
import { hashPassword, verifyPassword } from './password';

let dummyPasswordHash: Promise<string> | undefined;

// Verifying against a dummy hash when the email is unknown keeps the response
// time similar, so timing does not reveal which emails are registered.
const getDummyPasswordHash = (): Promise<string> => {
  dummyPasswordHash ??= hashPassword('dummy-password-for-timing');

  return dummyPasswordHash;
};

export const registerWithPassword = async ({
  email,
  name,
  password,
}: RegisterInput) => {
  return createUser({
    email,
    name,
    passwordHash: await hashPassword(password),
  });
};

export const authenticateWithPassword = async ({
  email,
  password,
}: LoginInput) => {
  const user = await findUserByEmailWithPasswordHash(email);

  const isValid = await verifyPassword(
    user?.passwordHash ?? (await getDummyPasswordHash()),
    password,
  );

  // Same error for unknown email, missing password and wrong password.
  if (!user?.passwordHash || !isValid) {
    throw new UnauthorizedError('INVALID_CREDENTIALS');
  }

  // Only after a correct password, so the suspension of an account isn't
  // revealed to someone who merely knows its email address.
  if (user.suspendedAt) {
    throw new ForbiddenError('ACCOUNT_SUSPENDED');
  }

  return user;
};
