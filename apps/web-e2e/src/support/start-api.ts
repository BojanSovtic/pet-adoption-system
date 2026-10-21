import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { E2E_API_PORT, E2E_WEB_URL } from './config';

/**
 * Starts the real API for E2E tests against a throwaway in-memory MongoDB
 * replica set (transactions need a replica set). Every run starts with an
 * empty database and never touches development data. Playwright stops this
 * process when the tests finish; the API and the database stop with it.
 *
 * Runs from the repo root (see playwright.config.ts).
 */
const start = async () => {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  // Explicit values win over apps/api/.env (dotenv never overrides).
  const api = spawn(
    process.execPath,
    ['--import', 'tsx', 'apps/api/src/main.ts'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        MONGODB_URI: replSet.getUri('pet-adoption-e2e'),
        PORT: String(E2E_API_PORT),
        HOST: 'localhost',
        CORS_ORIGIN: E2E_WEB_URL,
        SESSION_SECRET: 'e2e-session-secret-at-least-32-characters-long',
        UPLOADS_DIR: await mkdtemp(path.join(tmpdir(), 'pet-adoption-e2e-')),
      },
    },
  );

  const stop = async (exitCode: number) => {
    api.kill();
    await replSet.stop();
    process.exit(exitCode);
  };

  api.on('exit', (code) => void stop(code ?? 1));
  process.on('SIGINT', () => void stop(0));
  process.on('SIGTERM', () => void stop(0));
};

start().catch((error) => {
  console.error('[ e2e ] Could not start the API', error);
  process.exit(1);
});
