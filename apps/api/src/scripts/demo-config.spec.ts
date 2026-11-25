import {
  DEV_API_URL,
  PROD_API_URL,
  PUBLIC_DEMO_PASSWORD,
  resolveDemoPassword,
  resolveSeedRun,
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
      expect(resolveSeedTarget(['--qa'], {}, QA_API_URL).apiUrl).toBe(
        QA_API_URL,
      );
      expect(
        resolveSeedTarget(['--qa'], { DEMO_API_URL: QA_API_URL }, QA_API_URL)
          .apiUrl,
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
      expect(resolveSeedTarget(['--dev'], {}, QA_API_URL).apiUrl).toBe(
        DEV_API_URL,
      );
      expect(
        resolveSeedTarget(['--dev'], { DEMO_API_URL: DEV_API_URL }, QA_API_URL)
          .apiUrl,
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

  describe('pnpm prod:seed (--prod)', () => {
    it('always targets exactly the live demo through its site, over HTTPS', () => {
      expect(PROD_API_URL).toBe('https://pet-adoption-26o.pages.dev/api');
      expect(resolveSeedTarget(['--prod'], {}, QA_API_URL)).toEqual({
        name: 'prod',
        apiUrl: PROD_API_URL,
        publicPasswordAllowed: false,
        confirmHost: 'pet-adoption-26o.pages.dev',
        startupTimeoutMs: 180_000,
      });
    });

    it.each([DEV_API_URL, QA_API_URL, 'https://example.com/api'])(
      'refuses when DEMO_API_URL points elsewhere (%s)',
      (url) => {
        expect(() =>
          resolveSeedTarget(['--prod'], { DEMO_API_URL: url }, QA_API_URL),
        ).toThrow('Unset DEMO_API_URL');
      },
    );

    it.each([
      ['--prod', '--dev'],
      ['--qa', '--prod'],
    ])('cannot be combined with another target (%s %s)', (...flags) => {
      expect(() => resolveSeedTarget(flags, {}, QA_API_URL)).toThrow(
        'cannot be combined',
      );
    });
  });

  it.each(['--yes', '--dryrun', '--production'])(
    'refuses an unknown option (%s)',
    (option) => {
      expect(() => resolveSeedTarget(['--qa', option], {}, QA_API_URL)).toThrow(
        'Unknown option',
      );
    },
  );

  it('only uses local targets for dev and QA, with a single readiness check', () => {
    for (const flag of ['--dev', '--qa']) {
      const target = resolveSeedTarget([flag], {}, QA_API_URL);

      expect(target.apiUrl).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):/);
      expect(target.startupTimeoutMs).toBe(0);
      expect(target.confirmHost).toBeNull();
    }
  });
});

describe('resolveSeedRun', () => {
  const privatePassword = { DEMO_PASSWORD: 'a-long-private-pass-1234' };

  it('makes a production run without confirmations a dry run', () => {
    expect(resolveSeedRun(['--prod'], privatePassword, QA_API_URL).dryRun).toBe(
      true,
    );
  });

  it('allows a production dry run with a private password', () => {
    const run = resolveSeedRun(
      ['--prod', '--dry-run'],
      privatePassword,
      QA_API_URL,
    );

    expect(run.target.apiUrl).toBe(PROD_API_URL);
    expect(run.dryRun).toBe(true);
    expect(run.password).toBe(privatePassword.DEMO_PASSWORD);
  });

  it.each([
    ['missing', {}, 'Set DEMO_PASSWORD'],
    ['empty', { DEMO_PASSWORD: '' }, 'Set DEMO_PASSWORD'],
    ['public', { DEMO_PASSWORD: PUBLIC_DEMO_PASSWORD }, 'public demo password'],
    ['short', { DEMO_PASSWORD: 'too-short' }, '16 to 128 characters'],
  ])(
    'refuses a production dry run with a %s password, without showing it',
    (_, env: Record<string, string>, message) => {
      let error: unknown;

      try {
        resolveSeedRun(['--prod', '--dry-run'], env, QA_API_URL);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(message);
      if (env.DEMO_PASSWORD) {
        expect((error as Error).message).not.toContain(env.DEMO_PASSWORD);
      }
    },
  );

  it('keeps dev and QA as before: writes allowed, public password by default', () => {
    for (const flag of ['--dev', '--qa']) {
      const run = resolveSeedRun([flag], {}, QA_API_URL);

      expect(run.dryRun).toBe(false);
      expect(run.password).toBe(PUBLIC_DEMO_PASSWORD);
    }

    expect(resolveSeedRun(['--qa', '--dry-run'], {}, QA_API_URL).dryRun).toBe(
      true,
    );
  });

  describe('production write confirmation', () => {
    const HOST = 'pet-adoption-26o.pages.dev';
    const confirmed = ['--prod', '--confirm-prod', `--confirm-host=${HOST}`];

    it('changes data only with --confirm-prod and the exact host', () => {
      const run = resolveSeedRun(confirmed, privatePassword, QA_API_URL);

      expect(run.dryRun).toBe(false);
      expect(run.target.apiUrl).toBe(PROD_API_URL);
      expect(new URL(run.target.apiUrl).host).toBe(HOST);
    });

    it.each([
      ['no host confirmation', ['--prod', '--confirm-prod']],
      [
        'two host confirmations',
        [
          '--prod',
          '--confirm-prod',
          `--confirm-host=${HOST}`,
          `--confirm-host=${HOST}`,
        ],
      ],
    ])('refuses %s', (_, argv) => {
      expect(() => resolveSeedRun(argv, privatePassword, QA_API_URL)).toThrow(
        'exactly one --confirm-host=',
      );
    });

    it.each([
      '',
      'pet-adoption-26o.pages.dev.evil.com',
      'PET-ADOPTION-26O.PAGES.DEV',
      'https://pet-adoption-26o.pages.dev',
      'pet-adoption-26o.pages.dev ',
      '127.0.0.1:3336',
    ])('refuses a host that is not exactly the live site (%j)', (host) => {
      const error = (() => {
        try {
          resolveSeedRun(
            ['--prod', '--confirm-prod', `--confirm-host=${host}`],
            privatePassword,
            QA_API_URL,
          );
        } catch (caught) {
          return caught as Error;
        }

        return undefined;
      })();

      expect(error?.message).toContain("doesn't name the live site's host");
      // The expected host has to be typed on purpose, not copied from here.
      expect(error?.message).not.toContain(HOST);
    });

    it('refuses a host confirmation without --confirm-prod', () => {
      expect(() =>
        resolveSeedRun(
          ['--prod', `--confirm-host=${HOST}`],
          privatePassword,
          QA_API_URL,
        ),
      ).toThrow('needs --confirm-prod too');
    });

    it('refuses --dry-run together with --confirm-prod', () => {
      expect(() =>
        resolveSeedRun(
          [...confirmed, '--dry-run'],
          privatePassword,
          QA_API_URL,
        ),
      ).toThrow('contradict');
    });

    it.each(['--dev', '--qa'])('refuses the confirmations for %s', (flag) => {
      expect(() =>
        resolveSeedRun(
          [flag, '--confirm-prod', `--confirm-host=${HOST}`],
          {},
          QA_API_URL,
        ),
      ).toThrow('only for --prod');
      expect(() =>
        resolveSeedRun([flag, '--confirm-prod'], {}, QA_API_URL),
      ).toThrow('only for --prod');
    });

    it.each(['--yes', '--force', '--confirm', '--confirm-host'])(
      'has no shortcut option (%s)',
      (option) => {
        expect(() =>
          resolveSeedRun(['--prod', option], privatePassword, QA_API_URL),
        ).toThrow('Unknown option');
      },
    );

    it('still requires a private password for a confirmed run, without showing it', () => {
      for (const env of [{}, { DEMO_PASSWORD: PUBLIC_DEMO_PASSWORD }]) {
        expect(() => resolveSeedRun(confirmed, env, QA_API_URL)).toThrow(
          /DEMO_PASSWORD/,
        );
      }

      const short = 'short-secret-1';
      const error = (() => {
        try {
          resolveSeedRun(confirmed, { DEMO_PASSWORD: short }, QA_API_URL);
        } catch (caught) {
          return caught as Error;
        }

        return undefined;
      })();

      expect(error?.message).toContain('16 to 128 characters');
      expect(error?.message).not.toContain(short);
    });

    it('keeps the fixed production URL for a confirmed run', () => {
      expect(() =>
        resolveSeedRun(
          confirmed,
          { ...privatePassword, DEMO_API_URL: QA_API_URL },
          QA_API_URL,
        ),
      ).toThrow('Unset DEMO_API_URL');
    });
  });
});
