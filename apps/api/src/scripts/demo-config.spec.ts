import {
  DEV_API_URL,
  PUBLIC_DEMO_PASSWORD,
  resolveDemoPassword,
  resolveSeedTarget,
} from './demo-config';
import { QA_API_URL } from './qa-config';

describe('resolveDemoPassword', () => {
  describe('dev and QA (public default allowed)', () => {
    const options = { publicDefaultAllowed: true };

    it('uses the public demo password unless DEMO_PASSWORD is set', () => {
      expect(PUBLIC_DEMO_PASSWORD).toBe('demo-password');
      expect(resolveDemoPassword({}, options)).toBe(PUBLIC_DEMO_PASSWORD);
      expect(
        resolveDemoPassword({ DEMO_PASSWORD: 'my-local-pass' }, options),
      ).toBe('my-local-pass');
    });
  });

  describe('a target without a public default', () => {
    const options = { publicDefaultAllowed: false };
    const privatePassword = 'a-long-private-pass-1234';

    it('requires DEMO_PASSWORD', () => {
      expect(() => resolveDemoPassword({}, options)).toThrow(
        'Set DEMO_PASSWORD',
      );
      expect(() => resolveDemoPassword({ DEMO_PASSWORD: '' }, options)).toThrow(
        'Set DEMO_PASSWORD',
      );
    });

    it('refuses the public demo password', () => {
      expect(() =>
        resolveDemoPassword({ DEMO_PASSWORD: PUBLIC_DEMO_PASSWORD }, options),
      ).toThrow('public demo password');
    });

    it.each([
      ['too short', 'short-pass-15ch'],
      ['too long', 'x'.repeat(129)],
    ])('refuses a password that is %s', (_, password) => {
      expect(() =>
        resolveDemoPassword({ DEMO_PASSWORD: password }, options),
      ).toThrow('16 to 128 characters');
    });

    it('never includes the value in an error', () => {
      const password = 'secret-but-short';

      expect(() =>
        resolveDemoPassword({ DEMO_PASSWORD: password.slice(0, 10) }, options),
      ).toThrow(
        expect.objectContaining({
          message: expect.not.stringContaining(password.slice(0, 10)),
        }),
      );
    });

    it('accepts a long private password', () => {
      expect(
        resolveDemoPassword({ DEMO_PASSWORD: privatePassword }, options),
      ).toBe(privatePassword);
    });
  });
});

describe('resolveSeedTarget', () => {
  it('requires a target flag', () => {
    expect(() => resolveSeedTarget([], {}, QA_API_URL)).toThrow(
      'Choose a target',
    );
    // DEMO_API_URL alone doesn't choose a target either.
    expect(() =>
      resolveSeedTarget(
        [],
        { DEMO_API_URL: 'http://localhost:3399/api' },
        QA_API_URL,
      ),
    ).toThrow('Choose a target');
  });

  it('cannot combine --dev and --qa', () => {
    expect(() => resolveSeedTarget(['--dev', '--qa'], {}, QA_API_URL)).toThrow(
      'cannot be combined',
    );
  });

  describe('pnpm qa:seed (--qa)', () => {
    it('always targets exactly the QA API', () => {
      expect(QA_API_URL).toBe('http://127.0.0.1:3336/api');
      expect(resolveSeedTarget(['--qa'], {}, QA_API_URL)).toBe(QA_API_URL);
      expect(
        resolveSeedTarget(['--qa'], { DEMO_API_URL: QA_API_URL }, QA_API_URL),
      ).toBe(QA_API_URL);
    });

    it.each(['http://localhost:3333/api', 'http://localhost:3336/api'])(
      'refuses when DEMO_API_URL points elsewhere (%s)',
      (url) => {
        expect(() =>
          resolveSeedTarget(['--qa'], { DEMO_API_URL: url }, QA_API_URL),
        ).toThrow('Unset DEMO_API_URL');
      },
    );
  });

  describe('pnpm dev:seed (--dev)', () => {
    it('always targets exactly the development API', () => {
      expect(DEV_API_URL).toBe('http://localhost:3333/api');
      expect(resolveSeedTarget(['--dev'], {}, QA_API_URL)).toBe(DEV_API_URL);
      expect(
        resolveSeedTarget(['--dev'], { DEMO_API_URL: DEV_API_URL }, QA_API_URL),
      ).toBe(DEV_API_URL);
    });

    it('refuses when DEMO_API_URL points elsewhere', () => {
      expect(() =>
        resolveSeedTarget(
          ['--dev'],
          { DEMO_API_URL: 'http://127.0.0.1:3336/api' },
          QA_API_URL,
        ),
      ).toThrow('Unset DEMO_API_URL');
    });
  });
});
