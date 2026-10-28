/**
 * Where the demo data (seed-demo.ts) may be loaded. There are exactly two
 * targets, each chosen by a flag, so a seed can never land somewhere by
 * accident:
 *
 * - `--dev` (`pnpm dev:seed`): the local development API.
 * - `--qa` (`pnpm qa:seed`): the Docker QA stack (docker-compose.qa.yml).
 */

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
