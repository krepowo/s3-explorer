import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolvePath('./src'),
      // `server-only` throws outside a React Server Component graph; stub it for tests.
      'server-only': resolvePath('./tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    // The integration suites drive a real S3 over HTTP, and SeaweedFS serves a
    // freshly written object to anonymous readers with a short lag. The default
    // 5 s budget is less than the polling window, so a rename or a copy+delete
    // under load times out even though nothing is wrong.
    testTimeout: 20_000,
    // Integration files must not run side by side. They share one bucket, and
    // one of them runs the orphan sweeper with no grace period — which matches
    // objects against records for *its own connection*, so another suite's
    // in-flight objects look orphaned and get deleted mid-test.
    fileParallelism: false,
  },
});
