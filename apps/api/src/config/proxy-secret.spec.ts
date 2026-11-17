import { describe, expect, it } from 'vitest';

import { env } from './env';
import { PROXY_SECRET_MIN_LENGTH, readProxySecret } from './proxy-secret';

describe('readProxySecret', () => {
  const valid = 'a'.repeat(PROXY_SECRET_MIN_LENGTH);

  it.each([undefined, ''])('is off when unset (%j)', (value) => {
    expect(readProxySecret({ PROXY_SECRET: value })).toBeNull();
    expect(
      readProxySecret({ PROXY_SECRET: value, NODE_ENV: 'production' }),
    ).toBeNull();
  });

  it('accepts a long, header-safe value', () => {
    expect(readProxySecret({ PROXY_SECRET: valid })).toBe(valid);
    expect(readProxySecret({ PROXY_SECRET: `${valid}-_.~!$` })).toBe(
      `${valid}-_.~!$`,
    );
  });

  it('refuses a short value without revealing it', () => {
    const short = 'x'.repeat(PROXY_SECRET_MIN_LENGTH - 1);

    expect(() => readProxySecret({ PROXY_SECRET: short })).toThrow(
      `PROXY_SECRET must be at least ${PROXY_SECRET_MIN_LENGTH} characters`,
    );

    try {
      readProxySecret({ PROXY_SECRET: short });
    } catch (error) {
      expect((error as Error).message).not.toContain(short);
    }
  });

  it.each([
    ` ${valid}`,
    `${valid} `,
    `${'a'.repeat(16)} ${'a'.repeat(16)}`,
    `${valid}\n`,
    `${valid}é`,
  ])('refuses characters that are unsafe in a header (%j)', (value) => {
    expect(() => readProxySecret({ PROXY_SECRET: value })).toThrow(
      /visible ASCII/,
    );
  });

  it('is off in the test environment', () => {
    expect(env.proxySecret).toBeNull();
  });
});
