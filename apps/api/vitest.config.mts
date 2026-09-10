import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [],
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  test: {
    name: '@pet-adoption/api',
    watch: false,
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
});
