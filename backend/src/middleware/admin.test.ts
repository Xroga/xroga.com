import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canReadAdminOperations } from './admin.js';

test('operational evidence keeps current admin/owner policy and denies ordinary roles', () => {
  for (const role of ['guest', 'member', 'moderator', 'founder', '', null, undefined]) {
    assert.equal(canReadAdminOperations(role), false, String(role));
  }
  assert.equal(canReadAdminOperations('admin'), true);
  assert.equal(canReadAdminOperations('owner'), true);
});

test('readiness route enforces admin middleware before querying operational evidence', async () => {
  const source = await readFile(new URL('../routes/operations.ts', import.meta.url), 'utf8');
  const indexSource = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
  assert.match(source, /router\.get\('\/readiness',\s*adminMiddleware,/);
  assert.match(indexSource, /app\.use\('\/api\/operations',\s*authMiddleware,/);
});
