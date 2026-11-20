import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Live model tests: real DeepSeek, simulated layer. Not part of CI (needs ZURELAY_API_KEY).
export default defineConfig({
  resolve: { alias: { '@src': resolve(import.meta.dirname, 'src') } },
  test: { include: ['live/**/*.live.test.ts'], testTimeout: 600_000 },
});
