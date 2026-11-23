/**
 * Where the demo data (seed-demo.ts) may be loaded. There are exactly two
 * targets, each chosen by a flag, so a seed can never land somewhere by
 * accident:
 *
 * - `--dev` (`pnpm dev:seed`): the local development API.
 * - `--qa` (`pnpm qa:seed`): the Docker QA stack (docker-compose.qa.yml).
 */
import { PASSWORD_MAX_LENGTH } from '@pet-adoption/models';

/** The local development API (apps/api/.env, database `pet-adoption`). */
export const DEV_API_URL = 'http://localhost:3333/api';

/**
 * The API seed-demo sends its requests to. DEMO_API_URL is only accepted if
 * it names the same target, so the target can't silently change.
 */
export const resolveSeedTarget = (
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  qaApiUrl: string,
): string => {
  const dev = argv.includes('--dev');
  const qa = argv.includes('--qa');

  if (dev && qa) {
    throw new Error('--dev and --qa cannot be combined.');
  }

  if (!dev && !qa) {
    throw new Error(
      'Choose a target: pnpm dev:seed (local development) or pnpm qa:seed (Docker QA).',
    );
  }

  const target = dev ? DEV_API_URL : qaApiUrl;
  const override = env.DEMO_API_URL;

  if (override && override !== target) {
    throw new Error(
      `${dev ? '--dev' : '--qa'} always seeds ${target}, but DEMO_API_URL is "${override}". Unset DEMO_API_URL.`,
    );
  }

  return target;
};

/** The password of the dev and QA demo accounts; published in the README. */
export const PUBLIC_DEMO_PASSWORD = 'demo-password';

/**
 * A target that real visitors can reach must not use the published password:
 * anyone could sign in as the demo accounts, or register a demo address first
 * with that password and have the seed adopt the account as its own.
 */
export const PRIVATE_DEMO_PASSWORD_MIN_LENGTH = 16;

/**
 * The demo accounts' password, from DEMO_PASSWORD. Dev and QA fall back to
 * the public one. With `publicDefaultAllowed: false`, DEMO_PASSWORD is
 * required, must be long and must not be the public password. Messages never
 * include the value.
 */
export const resolveDemoPassword = (
  env: Readonly<Record<string, string | undefined>>,
  { publicDefaultAllowed }: { publicDefaultAllowed: boolean },
): string => {
  const password = env.DEMO_PASSWORD;

  if (publicDefaultAllowed) {
    return password ?? PUBLIC_DEMO_PASSWORD;
  }

  if (!password) {
    throw new Error(
      'Set DEMO_PASSWORD: this target never uses the public demo password.',
    );
  }

  if (password === PUBLIC_DEMO_PASSWORD) {
    throw new Error(
      'DEMO_PASSWORD is the public demo password from the README; choose a private one.',
    );
  }

  if (
    password.length < PRIVATE_DEMO_PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `DEMO_PASSWORD must have ${PRIVATE_DEMO_PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters for this target.`,
    );
  }

  return password;
};
