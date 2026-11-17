import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  enableTestPasswordHashing,
  hashPassword,
  PASSWORD_HASH_OPTIONS,
  verifyPassword,
} from './password';

// A fresh copy of the module, as the API loads it: nothing has switched it to
// the test parameters (src/test/setup.ts does that for the shared copy).
const loadFreshPasswordModule = async () => {
  vi.resetModules();

  // `.js` for TypeScript's module resolution; Vitest loads password.ts.
  return import('./password.js');
};

const PRODUCTION_PREFIX = '$argon2id$v=19$m=65536,p=4,t=3$';
const TEST_PREFIX = '$argon2id$v=19$m=1024,p=1,t=1$';

describe('password hashing', () => {
  let productionHash: string;

  // The only production-cost hash in this file (about 0.2 s alone; more on a
  // busy machine, hence the longer timeout).
  beforeAll(async () => {
    const fresh = await loadFreshPasswordModule();

    productionHash = await fresh.hashPassword('correct horse battery');
  }, 30_000);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('pins the production parameters explicitly', () => {
    expect(PASSWORD_HASH_OPTIONS).toEqual({
      type: 2, // argon2id
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 4,
    });
  });

  it('hashes with the production parameters unless tests opt out', () => {
    expect(productionHash.startsWith(PRODUCTION_PREFIX)).toBe(true);
  });

  it('uses the cheap test parameters in this test run', async () => {
    const hash = await hashPassword('correct horse battery');

    expect(hash.startsWith(TEST_PREFIX)).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
  });

  it('verifies a hash made with the production parameters', async () => {
    // The parameters are read from the hash itself.
    expect(await verifyPassword(productionHash, 'correct horse battery')).toBe(
      true,
    );
    expect(await verifyPassword(productionHash, 'wrong password')).toBe(false);
  });

  it('refuses the test parameters in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const fresh = await loadFreshPasswordModule();

    expect(() => fresh.enableTestPasswordHashing()).toThrow(
      'only allowed in Vitest runs',
    );
  });

  it('refuses the test parameters outside Vitest', async () => {
    vi.stubEnv('VITEST', '');
    const fresh = await loadFreshPasswordModule();

    expect(() => fresh.enableTestPasswordHashing()).toThrow(
      'only allowed in Vitest runs',
    );
  });

  it('allows the test parameters inside Vitest', () => {
    expect(() => enableTestPasswordHashing()).not.toThrow();
  });
});
