import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('actual table component preserves captured model rows and safe identities in both layouts', () => {
  const output = execFileSync(process.execPath, ['scripts/xroga/test-response-table-resources.mjs'], {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 1_000_000,
  });
  assert.match(output, /PASS: captured role table and stacked layout/);
});
