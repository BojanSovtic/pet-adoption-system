import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { env } from './env';
import { readEmailConfig } from './email-config';

const CWD = path.resolve('/repo');
const API_KEY = 'xkeysib-0123456789abcdef0123456789abcdef-AbCdEf123';

const development = { NODE_ENV: 'development' };
const vitest = { NODE_ENV: 'test', VITEST: 'true' };
const production = { NODE_ENV: 'production' };
const brevo = {
  EMAIL_DRIVER: 'brevo',
  BREVO_API_KEY: API_KEY,
  EMAIL_FROM: 'no-reply@pets.example.org',
};

describe('readEmailConfig', () => {
  describe('driver', () => {
    it.each([undefined, '', '  '])(
      'defaults to the outbox in development (%j)',
      (value) => {
        expect(
          readEmailConfig({ ...development, EMAIL_DRIVER: value }, CWD),
        ).toEqual({
          driver: 'outbox',
          from: { address: 'no-reply@example.com', name: 'Pet Adoption' },
          directory: path.resolve(CWD, 'apps/api/outbox'),
        });
      },
    );

    it('defaults to memory in Vitest runs', () => {
      expect(readEmailConfig(vitest, CWD).driver).toBe('memory');
    });

    it('is memory in this test run', () => {
      expect(env.email.driver).toBe('memory');
    });

    it('reads the outbox directory relative to the working directory', () => {
      expect(
        readEmailConfig({ ...development, EMAIL_OUTBOX_DIR: 'tmp/mails' }, CWD),
      ).toMatchObject({ directory: path.resolve(CWD, 'tmp/mails') });
    });

    it('accepts brevo with its settings outside tests', () => {
      expect(readEmailConfig({ ...development, ...brevo }, CWD)).toEqual({
        driver: 'brevo',
        from: { address: 'no-reply@pets.example.org', name: 'Pet Adoption' },
        apiKey: API_KEY,
      });
      expect(readEmailConfig({ ...production, ...brevo }, CWD).driver).toBe(
        'brevo',
      );
    });

    it.each(['smtp', 'Brevo', 'console'])('refuses %j', (value) => {
      expect(() =>
        readEmailConfig({ ...development, EMAIL_DRIVER: value }, CWD),
      ).toThrow(/EMAIL_DRIVER must be one of memory, outbox, brevo/);
    });
  });

  describe('safety', () => {
    it('requires a driver in production', () => {
      expect(() => readEmailConfig(production, CWD)).toThrow(
        'EMAIL_DRIVER is required in production',
      );
    });

    it.each(['outbox', 'memory'])('refuses %s in production', (value) => {
      expect(() =>
        readEmailConfig({ ...production, EMAIL_DRIVER: value }, CWD),
      ).toThrow(`EMAIL_DRIVER=${value} is not allowed in production`);
    });

    it('refuses memory outside Vitest', () => {
      expect(() =>
        readEmailConfig({ ...development, EMAIL_DRIVER: 'memory' }, CWD),
      ).toThrow('EMAIL_DRIVER=memory is only for the API tests');
    });

    it('refuses brevo in Vitest runs', () => {
      expect(() => readEmailConfig({ ...vitest, ...brevo }, CWD)).toThrow(
        'EMAIL_DRIVER=brevo is refused in Vitest runs',
      );
    });
  });

  describe('brevo settings', () => {
    it.each(['BREVO_API_KEY', 'EMAIL_FROM'])('requires %s', (name) => {
      expect(() =>
        readEmailConfig({ ...development, ...brevo, [name]: undefined }, CWD),
      ).toThrow(`${name} is required when EMAIL_DRIVER=brevo`);
      expect(() =>
        readEmailConfig({ ...development, ...brevo, [name]: '' }, CWD),
      ).toThrow(`${name} is required`);
    });

    it.each([
      ' xkeysib-0123456789abcdef',
      '"xkeysib-0123456789abcdef"',
      'short',
    ])('refuses a malformed API key without echoing it (%j)', (value) => {
      const read = () =>
        readEmailConfig(
          { ...development, ...brevo, BREVO_API_KEY: value },
          CWD,
        );

      expect(read).toThrow('BREVO_API_KEY is malformed');
      expect(read).not.toThrow(value);
    });

    it('ignores Brevo settings for the other drivers', () => {
      expect(
        readEmailConfig({ ...development, BREVO_API_KEY: 'bad key' }, CWD)
          .driver,
      ).toBe('outbox');
    });
  });

  describe('sender', () => {
    it('reads the address and display name', () => {
      expect(
        readEmailConfig(
          {
            ...development,
            EMAIL_FROM: ' hello@pets.example.org ',
            EMAIL_FROM_NAME: ' Pet Adoption Demo ',
          },
          CWD,
        ).from,
      ).toEqual({
        address: 'hello@pets.example.org',
        name: 'Pet Adoption Demo',
      });
    });

    it.each([
      'not-an-address',
      'Pets <hello@pets.example.org>',
      'a@b',
      'a b@example.org',
      `${'a'.repeat(250)}@example.org`,
    ])('refuses EMAIL_FROM %j', (value) => {
      expect(() =>
        readEmailConfig({ ...development, EMAIL_FROM: value }, CWD),
      ).toThrow('EMAIL_FROM must be a plain email address');
    });

    it.each([
      'Pets\r\nBcc: someone@example.org',
      'Pets\u0000',
      'x'.repeat(101),
    ])('refuses EMAIL_FROM_NAME %j', (value) => {
      expect(() =>
        readEmailConfig({ ...development, EMAIL_FROM_NAME: value }, CWD),
      ).toThrow('EMAIL_FROM_NAME must be at most 100 characters');
    });
  });
});
