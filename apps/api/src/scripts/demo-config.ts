/**
 * Where the demo data (seed-demo.ts) may be loaded. There are exactly three
 * targets, each chosen by a flag, so a seed can never land somewhere by
 * accident:
 *
 * - `--dev` (`pnpm dev:seed`): the local development API.
 * - `--qa` (`pnpm qa:seed`): the Docker QA stack (docker-compose.qa.yml).
 * - `--prod` (`pnpm prod:seed`): the live demo, through its public site (the
 *   API itself only accepts requests from that proxy). A dry run unless both
 *   production confirmations are given (see resolveSeedRun).
 */
import { PASSWORD_MAX_LENGTH } from '@pet-adoption/models';

/** The local development API (apps/api/.env, database `pet-adoption`). */
export const DEV_API_URL = 'http://localhost:3333/api';

/** The live demo's API, through the Cloudflare Pages proxy. */
export const PROD_API_URL = 'https://pet-adoption-26o.pages.dev/api';

export type SeedTargetName = 'dev' | 'qa' | 'prod';

export type SeedTarget = {
  name: SeedTargetName;
  apiUrl: string;
  /** Whether the README's demo password may be used (never in production). */
  publicPasswordAllowed: boolean;
  /**
   * The host name a run that changes data must confirm (`--confirm-prod`
   * plus `--confirm-host=<host>`), or `null` where no confirmation is needed.
   * Without both confirmations such a target only gets dry runs.
   */
  confirmHost: string | null;
  /**
   * How long to wait for the API to become ready. Local APIs either run or
   * don't (one check); the live API sleeps when idle (Render Free) and can
   * take a minute or two to wake up.
   */
  startupTimeoutMs: number;
};

const FLAGS: Record<`--${SeedTargetName}`, SeedTargetName> = {
  '--dev': 'dev',
  '--qa': 'qa',
  '--prod': 'prod',
};

const DRY_RUN = '--dry-run';
const CONFIRM_PROD = '--confirm-prod';
const CONFIRM_HOST = '--confirm-host=';

const isKnownOption = (arg: string) =>
  arg in FLAGS ||
  arg === DRY_RUN ||
  arg === CONFIRM_PROD ||
  arg.startsWith(CONFIRM_HOST);

/**
 * The target seed-demo sends its requests to. DEMO_API_URL is only accepted if
 * it names the same target, so the target can't silently change. Unknown
 * options are refused, so a typo can't be mistaken for a safety flag.
 */
export const resolveSeedTarget = (
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  qaApiUrl: string,
): SeedTarget => {
  const options = argv.filter((arg) => arg.startsWith('--'));
  const unknown = options.filter((arg) => !isKnownOption(arg));

  if (unknown.length > 0) {
    throw new Error(`Unknown option ${unknown.join(', ')}.`);
  }

  const names = options.flatMap((arg) =>
    arg in FLAGS ? [FLAGS[arg as keyof typeof FLAGS]] : [],
  );

  if (names.length > 1) {
    throw new Error(
      `${names.map((n) => `--${n}`).join(' and ')} cannot be combined.`,
    );
  }

  if (names.length === 0) {
    throw new Error(
      'Choose a target: pnpm dev:seed (local development), pnpm qa:seed (Docker QA) or pnpm prod:seed (live demo, dry run).',
    );
  }

  const name = names[0];
  const target: SeedTarget =
    name === 'prod'
      ? {
          name,
          apiUrl: PROD_API_URL,
          publicPasswordAllowed: false,
          confirmHost: new URL(PROD_API_URL).host,
          startupTimeoutMs: 180_000,
        }
      : {
          name,
          apiUrl: name === 'dev' ? DEV_API_URL : qaApiUrl,
          publicPasswordAllowed: true,
          confirmHost: null,
          startupTimeoutMs: 0,
        };
  const override = env.DEMO_API_URL;

  if (override && override !== target.apiUrl) {
    throw new Error(
      `--${name} always seeds ${target.apiUrl}, but DEMO_API_URL is "${override}". Unset DEMO_API_URL.`,
    );
  }

  return target;
};

/** Everything a seed run needs to know before it sends a request. */
export type SeedRun = {
  target: SeedTarget;
  dryRun: boolean;
  password: string;
};

/**
 * Resolves the target, the mode and the password, and refuses combinations
 * that aren't allowed (see resolveDemoPassword for the password rules).
 *
 * A target with `confirmHost` (production) is a dry run by default. It
 * changes data only with `--confirm-prod` and `--confirm-host=<host>` naming
 * its host exactly; anything partial, wrong or contradictory is refused
 * rather than quietly turned into a dry run, so a mistyped write command
 * never looks like it worked. The expected host is not repeated in errors:
 * it has to be typed on purpose.
 */
export const resolveSeedRun = (
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  qaApiUrl: string,
): SeedRun => {
  const target = resolveSeedTarget(argv, env, qaApiUrl);
  const explicitDryRun = argv.includes(DRY_RUN);
  const confirmProd = argv.includes(CONFIRM_PROD);
  const hostArgs = argv.filter((arg) => arg.startsWith(CONFIRM_HOST));
  let dryRun = explicitDryRun;

  if (!target.confirmHost) {
    if (confirmProd || hostArgs.length > 0) {
      throw new Error(
        `${CONFIRM_PROD} and ${CONFIRM_HOST}… are only for --prod.`,
      );
    }
  } else if (!confirmProd) {
    if (hostArgs.length > 0) {
      throw new Error(
        `${CONFIRM_HOST}… needs ${CONFIRM_PROD} too; without both, --${target.name} is a dry run.`,
      );
    }

    dryRun = true;
  } else {
    if (explicitDryRun) {
      throw new Error(
        `${DRY_RUN} and ${CONFIRM_PROD} contradict each other; choose one.`,
      );
    }

    if (hostArgs.length !== 1) {
      throw new Error(
        `${CONFIRM_PROD} also needs exactly one ${CONFIRM_HOST}<host> with the live site's host name.`,
      );
    }

    if (hostArgs[0].slice(CONFIRM_HOST.length) !== target.confirmHost) {
      throw new Error(
        `${CONFIRM_HOST} doesn't name the live site's host exactly, so nothing was sent.`,
      );
    }

    dryRun = false;
  }

  const password = resolveDemoPassword(env, {
    publicDefaultAllowed: target.publicPasswordAllowed,
  });

  return { target, dryRun, password };
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
      'Set DEMO_PASSWORD: this target never uses the public demo password. It is empty in this terminal session ' +
        '(for example, nothing was pasted); nothing was sent. See README, "Demo data on the live demo".',
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
