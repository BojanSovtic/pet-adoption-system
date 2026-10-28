import { argon2id, hash, verify, type HashOptions } from 'argon2';

/**
 * Production parameters: Argon2id, 64 MiB memory, 3 iterations, 4 lanes
 * (argon2's defaults, written out so a library update can't change them).
 * They exceed the OWASP minimum and are stored inside each hash string, so
 * `verify` checks old hashes with the parameters they were made with.
 */
export const PASSWORD_HASH_OPTIONS: Readonly<HashOptions> = Object.freeze({
  type: argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
});

/**
 * Much cheaper parameters for the API's unit/integration tests only, where
 * hundreds of sign-ups otherwise compete for 4 libuv threads. Still a real
 * Argon2id hash. Turned on by `enableTestPasswordHashing` (src/test/setup.ts).
 * E2E runs keep the production parameters.
 */
export const TEST_PASSWORD_HASH_OPTIONS: Readonly<HashOptions> = Object.freeze({
  type: argon2id,
  memoryCost: 1024,
  timeCost: 1,
  parallelism: 1,
});

let hashOptions: Readonly<HashOptions> = PASSWORD_HASH_OPTIONS;

/**
 * Switches this process to the test parameters. Throws unless it runs inside
 * Vitest (`VITEST` is set by the test runner) and outside production, so the
 * API can't be started with cheap hashes by accident; nothing in the app
 * itself calls it.
 */
export const enableTestPasswordHashing = (): void => {
  if (!process.env.VITEST || process.env.NODE_ENV === 'production') {
    throw new Error('Test password hashing is only allowed in Vitest runs');
  }

  hashOptions = TEST_PASSWORD_HASH_OPTIONS;
};

export const hashPassword = (password: string): Promise<string> =>
  hash(password, hashOptions);

export const verifyPassword = (
  passwordHash: string,
  password: string,
): Promise<boolean> => verify(passwordHash, password);
