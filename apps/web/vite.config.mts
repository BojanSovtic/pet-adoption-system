/// <reference types='vitest' />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  // strictPort: fail if the port is taken instead of silently moving to the
  // next one. The API only allows CORS_ORIGIN (http://localhost:4200), so a
  // dev server on another port would load but every API request would fail.
  server: {
    port: 4200,
    host: 'localhost',
    strictPort: true,
  },
  preview: {
    port: 4300,
    host: 'localhost',
    strictPort: true,
  },
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    // Same as `"@/*": ["./src/*"]` in tsconfig. Declared here as well so the
    // alias doesn't depend on tsconfig discovery, which failed for Vitest in CI.
    alias: { '@': `${import.meta.dirname}/src` },
  },
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../dist/apps/web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/web',
      provider: 'v8' as const,
    },
  },
}));
