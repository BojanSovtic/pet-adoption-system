import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { E2E_MONGODB_URI } from './config';

const workspaceRoot = path.resolve(__dirname, '../../../..');

/**
 * Makes a registered user an admin with the real `admin:grant` command, run
 * against this E2E run's database, exactly as an operator would. The API has
 * no way to create an admin, by design.
 */
export const grantAdmin = (email: string): void => {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'tsx',
      'apps/api/src/scripts/admin-role.ts',
      'grant',
      email,
      '--yes',
    ],
    {
      cwd: workspaceRoot,
      // The command needs only the database (no web server settings).
      env: { ...process.env, MONGODB_URI: E2E_MONGODB_URI },
      encoding: 'utf8',
      // pnpm is a .cmd script on Windows.
      shell: process.platform === 'win32',
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `admin:grant failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
};
