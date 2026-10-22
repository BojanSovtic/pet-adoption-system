import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

import {
  DEMO_API_PORT,
  DEMO_DB_SUFFIX,
  DEMO_MONGODB_URI,
  DEMO_UPLOADS_DIR,
  DEMO_WEB_PORT,
  DEV_UPLOADS_DIR,
  getDatabaseName,
} from './demo-config';

/**
 * Starts the API and the web app for the demo, like Playwright does for E2E:
 * the real API from source with the demo database and photo folder, and the
 * Vite dev server pointed at it. Other settings (SESSION_SECRET) come from
 * apps/api/.env; explicit values here win over it (dotenv never overrides).
 *
 * Needs MongoDB running (`docker compose up -d`). Ctrl+C stops both.
 */
const databaseName = getDatabaseName(DEMO_MONGODB_URI);

if (!databaseName.endsWith(DEMO_DB_SUFFIX)) {
  console.error(
    `[ demo ] Refusing to start: database "${databaseName}" does not end with "${DEMO_DB_SUFFIX}".`,
  );
  process.exit(1);
}

if (DEMO_UPLOADS_DIR === DEV_UPLOADS_DIR) {
  console.error('[ demo ] Refusing to use the development photo folder.');
  process.exit(1);
}

const webUrl = `http://localhost:${DEMO_WEB_PORT}`;
const apiUrl = `http://localhost:${DEMO_API_PORT}/api`;

const viteBin = path.join(
  path.dirname(require.resolve('vite/package.json')),
  'bin',
  'vite.js',
);

const children: ChildProcess[] = [
  spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      MONGODB_URI: DEMO_MONGODB_URI,
      UPLOADS_DIR: DEMO_UPLOADS_DIR,
      PORT: String(DEMO_API_PORT),
      HOST: 'localhost',
      CORS_ORIGIN: webUrl,
    },
  }),
  spawn(
    process.execPath,
    [
      viteBin,
      '--config',
      'apps/web/vite.config.mts',
      '--port',
      String(DEMO_WEB_PORT),
      '--strictPort',
    ],
    { stdio: 'inherit', env: { ...process.env, VITE_API_URL: apiUrl } },
  ),
];

console.log(
  `[ demo ] Database: ${databaseName}, photos: ${DEMO_UPLOADS_DIR}\n` +
    `[ demo ] Web app: ${webUrl}  API: ${apiUrl}  (Ctrl+C stops both)`,
);

// If either process ends, stop the other one too.
const stopAll = (exitCode: number) => {
  for (const child of children) {
    child.kill();
  }
  process.exit(exitCode);
};

for (const child of children) {
  child.on('exit', (code) => stopAll(code ?? 1));
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
