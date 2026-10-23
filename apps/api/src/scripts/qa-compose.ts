import { spawnSync } from 'node:child_process';

import { buildQaComposeArgs } from './qa-config';

/**
 * Runs `docker compose` for the QA stack only: always with
 * `-f docker-compose.qa.yml -p pet-adoption-qa`. Used by the pnpm qa:up,
 * qa:ps, qa:logs and qa:down scripts. Options that delete data (such as
 * `down -v`) are refused.
 */
const main = () => {
  const [command, ...extra] = process.argv.slice(2);
  const args = buildQaComposeArgs(command, extra);

  console.log(`[ qa ] docker ${args.join(' ')}`);

  const result = spawnSync('docker', args, { stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
};

try {
  main();
} catch (error) {
  console.error(`[ qa ] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
