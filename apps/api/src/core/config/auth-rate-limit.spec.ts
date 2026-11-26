import { describe, expect, it } from 'vitest';

import { readAuthAttemptsPerIpOverride } from './auth-rate-limit';

describe('readAuthAttemptsPerIpOverride', () => {
  it.each([undefined, ''])('is off when unset (%j)', (value) => {
    expect(
      readAuthAttemptsPerIpOverride({ AUTH_ATTEMPTS_PER_IP: value }),
    ).toBeNull();
    expect(
      readAuthAttemptsPerIpOverride({
        AUTH_ATTEMPTS_PER_IP: value,
        NODE_ENV: 'production',
      }),
    ).toBeNull();
  });

  it('accepts a positive integer outside production', () => {
    expect(readAuthAttemptsPerIpOverride({ AUTH_ATTEMPTS_PER_IP: '200' })).toBe(
      200,
    );
  });

  it('refuses any value in production', () => {
    expect(() =>
      readAuthAttemptsPerIpOverride({
        AUTH_ATTEMPTS_PER_IP: '200',
        NODE_ENV: 'production',
      }),
    ).toThrow('AUTH_ATTEMPTS_PER_IP must not be set in production');
  });

  it.each(['0', '-5', '1.5', '20abc', ' 20', '1e3', 'many'])(
    'refuses a value that is not a positive integer (%j)',
    (value) => {
      expect(() =>
        readAuthAttemptsPerIpOverride({ AUTH_ATTEMPTS_PER_IP: value }),
      ).toThrow('AUTH_ATTEMPTS_PER_IP must be a positive integer');
    },
  );

  it('is off in the test environment, so the API tests use the real limit', () => {
    expect(readAuthAttemptsPerIpOverride()).toBeNull();
  });
});
