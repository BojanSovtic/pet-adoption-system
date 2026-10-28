import { DEV_API_URL, resolveSeedTarget } from './demo-config';
import { QA_API_URL } from './qa-config';

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
