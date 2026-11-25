import { spawnSync } from 'node:child_process';

import {
  checkQaContainer,
  checkQaDatabaseUri,
  QA_CONTAINERS,
  QA_DATABASE,
  type ContainerInspect,
} from './qa-config';

/**
 * Empties the Docker QA stack's data: all documents in the QA database (the
 * collections and indexes stay) and all files in the QA upload volume. It
 * never deletes Docker volumes and never touches another stack.
 *
 * Before doing anything it checks, via `docker inspect`, that both QA
 * containers belong to the pet-adoption-qa project, are running, have the QA
 * volumes mounted, and that the API is configured for the QA database. The
 * database name is checked again inside MongoDB before deleting.
 *
 * Without --yes it only shows what it would delete.
 */

const docker = (args: string[]): string => {
  const result = spawnSync('docker', args, { encoding: 'utf8' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `docker ${args.slice(0, 2).join(' ')} failed: ${result.stderr.trim()}`,
    );
  }

  return result.stdout;
};

const inspect = (name: string): ContainerInspect | undefined => {
  const result = spawnSync('docker', ['inspect', name], { encoding: 'utf8' });

  if (result.error) {
    throw result.error;
  }

  // A missing container is reported by the checks, not as a crash.
  return result.status === 0
    ? (JSON.parse(result.stdout) as ContainerInspect[])[0]
    : undefined;
};

// Runs inside the QA MongoDB container. It refuses unless the current
// database is the QA database, then counts (or empties) the collections.
const mongoScript = (confirmed: boolean) => `
if (db.getName() !== ${JSON.stringify(QA_DATABASE)}) {
  throw new Error('Refusing: connected to ' + db.getName());
}
const counts = {};
for (const name of db.getCollectionNames().filter((c) => !c.startsWith('system.'))) {
  counts[name] = db.getCollection(name).countDocuments();
  ${confirmed ? 'db.getCollection(name).deleteMany({});' : ''}
}
print(JSON.stringify(counts));
`;

const main = () => {
  const confirmed = process.argv.includes('--yes');
  const mongodb = inspect(QA_CONTAINERS.mongodb.name);
  const api = inspect(QA_CONTAINERS.api.name);
  const problems = [
    ...checkQaContainer(QA_CONTAINERS.mongodb, mongodb),
    ...checkQaContainer(QA_CONTAINERS.api, api),
    ...(api ? checkQaDatabaseUri(api.Config?.Env) : []),
  ];

  if (problems.length > 0) {
    throw new Error(
      `Refusing to reset; nothing was changed:\n  ${problems.join('\n  ')}`,
    );
  }

  const counts = docker([
    'exec',
    QA_CONTAINERS.mongodb.name,
    'mongosh',
    '--quiet',
    QA_DATABASE,
    '--eval',
    mongoScript(false),
  ]).trim();
  const fileCount = docker([
    'exec',
    QA_CONTAINERS.api.name,
    'sh',
    '-c',
    `find ${QA_CONTAINERS.api.mount} -type f | wc -l`,
  ]).trim();

  console.log(
    `QA database "${QA_DATABASE}" (container ${QA_CONTAINERS.mongodb.name}): ${counts}\n` +
      `QA photos (volume ${QA_CONTAINERS.api.volume}): ${fileCount} file(s)`,
  );

  if (!confirmed) {
    console.log(
      '\nDry run: nothing was deleted. Run "pnpm qa:reset --yes" to delete the above.',
    );
    return;
  }

  docker([
    'exec',
    QA_CONTAINERS.mongodb.name,
    'mongosh',
    '--quiet',
    QA_DATABASE,
    '--eval',
    mongoScript(true),
  ]);
  docker([
    'exec',
    QA_CONTAINERS.api.name,
    'find',
    QA_CONTAINERS.api.mount,
    '-mindepth',
    '1',
    '-delete',
  ]);

  console.log(
    '\nQA data deleted (volumes kept). Run "pnpm qa:seed" to load the demo data again.',
  );
};

try {
  main();
} catch (error) {
  console.error(
    `[ qa:reset ] ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
}
