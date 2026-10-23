/**
 * The isolated Docker QA stack (docker-compose.qa.yml). These names must
 * match that file; reset-qa refuses to touch anything that doesn't.
 */
export const QA_COMPOSE_FILE = 'docker-compose.qa.yml';
export const QA_PROJECT = 'pet-adoption-qa';
export const QA_DATABASE = 'pet-adoption-qa';
export const QA_API_URL = 'http://127.0.0.1:3336/api';

export const QA_CONTAINERS = {
  mongodb: {
    name: 'pet-adoption-qa-mongodb',
    service: 'mongodb',
    mount: '/data/db',
    volume: 'pet-adoption-qa_mongodb_data',
  },
  api: {
    name: 'pet-adoption-qa-api',
    service: 'api',
    mount: '/app/uploads',
    volume: 'pet-adoption-qa_uploads_data',
  },
} as const;

/** What each qa:* script runs, after `docker compose -f … -p …`. */
const QA_COMMANDS: Record<string, string[]> = {
  up: ['up', '-d', '--build'],
  ps: ['ps'],
  logs: ['logs', '-f'],
  // `down` without -v: containers and the network go, volumes (data) stay.
  down: ['down'],
};

/** Options that would delete QA data or images; never passed through. */
const FORBIDDEN_OPTIONS = /^(-v|--volumes|--rmi|-[a-z]*v[a-z]*)(=.*)?$/;

/**
 * The full `docker` arguments for a QA command. Extra arguments are allowed
 * only as service names (e.g. `pnpm qa:logs web`), never as options.
 */
export const buildQaComposeArgs = (
  command: string | undefined,
  extra: string[],
): string[] => {
  const base = command ? QA_COMMANDS[command] : undefined;

  if (!base) {
    throw new Error(
      `Unknown QA command "${command ?? ''}". Use one of: ${Object.keys(QA_COMMANDS).join(', ')}.`,
    );
  }

  for (const argument of extra) {
    if (FORBIDDEN_OPTIONS.test(argument)) {
      throw new Error(
        `"${argument}" is not allowed: it would delete QA data. To empty the QA data, use pnpm qa:reset.`,
      );
    }

    if (argument.startsWith('-') || !/^(mongodb|api|web)$/.test(argument)) {
      throw new Error(
        `"${argument}" is not allowed. Only the service names mongodb, api and web can be added.`,
      );
    }
  }

  return [
    'compose',
    '-f',
    QA_COMPOSE_FILE,
    '-p',
    QA_PROJECT,
    ...base,
    ...extra,
  ];
};

/** The parts of `docker inspect` output the checks use. */
export type ContainerInspect = {
  Name?: string;
  State?: { Running?: boolean };
  Config?: { Labels?: Record<string, string>; Env?: string[] };
  Mounts?: Array<{ Type?: string; Name?: string; Destination?: string }>;
};

/**
 * Checks that a container is the expected, running QA container with the
 * expected QA volume. Returns the problems found; empty means safe.
 */
export const checkQaContainer = (
  expected: (typeof QA_CONTAINERS)[keyof typeof QA_CONTAINERS],
  inspect: ContainerInspect | undefined,
): string[] => {
  if (!inspect) {
    return [`${expected.name}: container not found. Start it with pnpm qa:up.`];
  }

  const problems: string[] = [];
  const labels = inspect.Config?.Labels ?? {};

  if (inspect.Name !== `/${expected.name}`) {
    problems.push(
      `${expected.name}: unexpected container name ${inspect.Name}.`,
    );
  }

  if (labels['com.docker.compose.project'] !== QA_PROJECT) {
    problems.push(
      `${expected.name}: belongs to Compose project "${labels['com.docker.compose.project']}", not "${QA_PROJECT}".`,
    );
  }

  if (labels['com.docker.compose.service'] !== expected.service) {
    problems.push(
      `${expected.name}: is service "${labels['com.docker.compose.service']}", not "${expected.service}".`,
    );
  }

  if (!inspect.State?.Running) {
    problems.push(`${expected.name}: not running. Start it with pnpm qa:up.`);
  }

  const mount = inspect.Mounts?.find(
    (candidate) => candidate.Destination === expected.mount,
  );

  if (mount?.Type !== 'volume' || mount.Name !== expected.volume) {
    problems.push(
      `${expected.name}: ${expected.mount} is ${mount ? `"${mount.Name ?? mount.Type}"` : 'not mounted'}, not the QA volume "${expected.volume}".`,
    );
  }

  return problems;
};

/**
 * Checks that the QA API's database connection points at the QA MongoDB
 * service and the QA database, as docker-compose.qa.yml sets it.
 */
export const checkQaDatabaseUri = (env: string[] | undefined): string[] => {
  const uri = env
    ?.find((entry) => entry.startsWith('MONGODB_URI='))
    ?.slice('MONGODB_URI='.length);

  if (!uri) {
    return [`${QA_CONTAINERS.api.name}: MONGODB_URI is not set.`];
  }

  let parsed: URL;

  try {
    parsed = new URL(uri);
  } catch {
    return [`${QA_CONTAINERS.api.name}: MONGODB_URI is not a valid URL.`];
  }

  const problems: string[] = [];
  const database = parsed.pathname.replace(/^\//, '');

  if (parsed.hostname !== QA_CONTAINERS.mongodb.service) {
    problems.push(
      `${QA_CONTAINERS.api.name}: connects to "${parsed.hostname}", not the QA MongoDB service "${QA_CONTAINERS.mongodb.service}".`,
    );
  }

  if (database !== QA_DATABASE) {
    problems.push(
      `${QA_CONTAINERS.api.name}: uses database "${database}", not "${QA_DATABASE}".`,
    );
  }

  return problems;
};
