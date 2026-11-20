import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@src': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    // Agent-loop tests run many turns against IndexedDB. Alone the slowest takes about 1.4 s; inside the full parallel run on a loaded machine it
    // exceeded the 5 s default (measured: elision.test.ts 0.9-1.4 s alone, over 5 s under load). An explicit limit keeps that from being mistaken for a failure.
    testTimeout: 20_000,
  },
});
