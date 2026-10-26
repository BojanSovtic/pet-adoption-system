import {
  DEFAULT_DEMO_API_URL,
  DEV_API_URL,
  resolveSeedTarget,
} from './demo-config';
import { QA_API_URL } from './qa-config';

describe('resolveSeedTarget', () => {
  describe('pnpm demo:seed (no --qa): unchanged demo behaviour', () => {
    it('uses the demo API by default', () => {
      expect(resolveSeedTarget([], {}, QA_API_URL)).toBe(DEFAULT_DEMO_API_URL);
      expect(DEFAULT_DEMO_API_URL).toBe('http://localhost:3335/api');
    });

    it('follows DEMO_API_URL for other stacks', () => {
      expect(
        resolveSeedTarget(
          [],
          { DEMO_API_URL: 'http://localhost:3399/api' },
          QA_API_URL,
        ),
      ).toBe('http://localhost:3399/api');
    });

    it('needs --allow-port-3333 for the development/Docker API', () => {
      const env = { DEMO_API_URL: 'http://localhost:3333/api' };

      expect(() => resolveSeedTarget([], env, QA_API_URL)).toThrow(
        '--allow-port-3333',
      );
      expect(resolveSeedTarget(['--allow-port-3333'], env, QA_API_URL)).toBe(
        'http://localhost:3333/api',
      );
    });

    it.each(['http://127.0.0.1:3336/api', 'http://localhost:3336/api'])(
      'refuses the QA API %s without --qa',
      (url) => {
        expect(() =>
          resolveSeedTarget([], { DEMO_API_URL: url }, QA_API_URL),
        ).toThrow('pnpm qa:seed');
      },
    );

    it('refuses an invalid DEMO_API_URL', () => {
      expect(() =>
        resolveSeedTarget([], { DEMO_API_URL: 'localhost' }, QA_API_URL),
      ).toThrow('not a valid URL');
    });
  });

  describe('pnpm qa:seed (--qa)', () => {
    it('always targets exactly the QA API', () => {
      expect(QA_API_URL).toBe('http://127.0.0.1:3336/api');
      expect(resolveSeedTarget(['--qa'], {}, QA_API_URL)).toBe(QA_API_URL);
      expect(
        resolveSeedTarget(['--qa'], { DEMO_API_URL: QA_API_URL }, QA_API_URL),
      ).toBe(QA_API_URL);
    });

    it.each([
      'http://localhost:3335/api',
      'http://localhost:3333/api',
      'http://localhost:3336/api',
    ])('refuses when DEMO_API_URL points elsewhere (%s)', (url) => {
      expect(() =>
        resolveSeedTarget(['--qa'], { DEMO_API_URL: url }, QA_API_URL),
      ).toThrow('Unset DEMO_API_URL');
    });

    it('cannot be combined with --allow-port-3333', () => {
      expect(() =>
        resolveSeedTarget(['--qa', '--allow-port-3333'], {}, QA_API_URL),
      ).toThrow('cannot be combined');
    });
  });

  describe('pnpm dev:seed (--dev)', () => {
    it('always targets exactly the development API', () => {
      expect(DEV_API_URL).toBe('http://localhost:3333/api');
      expect(resolveSeedTarget(['--dev'], {}, QA_API_URL)).toBe(DEV_API_URL);
      expect(
        resolveSeedTarget(['--dev'], { DEMO_API_URL: DEV_API_URL }, QA_API_URL),
      ).toBe(DEV_API_URL);
    });

    it.each(['http://localhost:3335/api', 'http://127.0.0.1:3336/api'])(
      'refuses when DEMO_API_URL points elsewhere (%s)',
      (url) => {
        expect(() =>
          resolveSeedTarget(['--dev'], { DEMO_API_URL: url }, QA_API_URL),
        ).toThrow('Unset DEMO_API_URL');
      },
    );

    it('cannot be combined with --qa', () => {
      expect(() =>
        resolveSeedTarget(['--dev', '--qa'], {}, QA_API_URL),
      ).toThrow('cannot be combined');
    });
  });
});
