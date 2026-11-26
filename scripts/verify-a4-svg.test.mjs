import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const run = (f) => spawnSync(process.execPath, ['scripts/verify-a4-svg.mjs', f], { encoding: 'utf8' });
test('the real exported A4 design passes', () => { assert.equal(run('scripts/fixtures/a4-good.svg').status, 0); });
test('the earlier export whose circle left the page fails', () => {
  const r = run('scripts/fixtures/a4-overflow.svg');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /leaves the page/);
});
