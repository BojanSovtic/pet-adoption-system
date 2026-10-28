import { defineConfig, devices } from '@playwright/test';

import {
  E2E_API_PORT,
  E2E_API_URL,
  E2E_WEB_PORT,
  E2E_WEB_URL,
} from './src/support/config';

// Relative to this config file: the servers run from the repo root.
const workspaceRoot = '../..';

export default defineConfig({
  testDir: './src',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Login and register share a per-IP rate limit (20 per 15 minutes); retries
  // would add attempts against the same API process.
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: E2E_WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // The real API, with its own throwaway database (see start-api.ts).
      command: 'pnpm exec tsx apps/web-e2e/src/support/start-api.ts',
      cwd: workspaceRoot,
      url: `http://localhost:${E2E_API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite --config apps/web/vite.config.mts --port ${E2E_WEB_PORT} --strictPort`,
      cwd: workspaceRoot,
      url: E2E_WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      // Point the web app at the E2E API instead of the dev API.
      env: { VITE_API_URL: E2E_API_URL },
    },
  ],
});
