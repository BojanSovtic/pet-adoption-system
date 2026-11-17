import { defineConfig, devices } from '@playwright/test';

import {
  E2E_API_PORT,
  E2E_API_URL,
  E2E_WEB_PORT,
  E2E_WEB_URL,
} from './src/support/config';

// Relative to this config file: the servers run from the repo root.
const workspaceRoot = '../..';

// The production build of the web app used by E2E runs. Its own folder (relative
// to apps/web), so it never replaces the normal build in dist/apps/web: the
// API URL is baked into the bundle at build time.
const e2eWebBuildDir = '../../dist/e2e/web';

export default defineConfig({
  testDir: './src',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Login and register share a per-IP rate limit (20 per 15 minutes); retries
  // would add attempts against the same API process.
  retries: 0,
  // On failure: a trace and a screenshot per failed test in test-results/,
  // and in CI an HTML report in playwright-report/ (both uploaded by CI).
  // Passing tests leave nothing behind.
  outputDir: './test-results',
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL: E2E_WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
      // The production build (same `vite build` as `nx build` and the web
      // Docker image), served by `vite preview`. Testing the built bundle is
      // closer to production and avoids the dev server's on-demand compiling,
      // the likely cause of the slow, occasionally failing first test.
      command:
        `pnpm exec vite build --config apps/web/vite.config.mts --outDir ${e2eWebBuildDir} --logLevel warn` +
        ` && pnpm exec vite preview --config apps/web/vite.config.mts --outDir ${e2eWebBuildDir} --port ${E2E_WEB_PORT} --strictPort`,
      cwd: workspaceRoot,
      url: E2E_WEB_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      // Point the web app at the E2E API instead of the dev API.
      env: { VITE_API_URL: E2E_API_URL },
    },
  ],
});
