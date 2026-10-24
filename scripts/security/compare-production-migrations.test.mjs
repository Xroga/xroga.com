import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMigration } from './compare-production-migrations.mjs';

test('matches the actual runner version, not counts, timestamps or similar names', () => {
  const history = [{ version: '123', name: 'vault' }, { version: '124_vault.sql', name: '124_vault.sql' }];
  const pending = classifyMigration('124_vault.sql', 'create or replace function guard() returns bool as $$ select true $$ language sql;', history);
  assert.equal(pending.runnerWouldSkip, false);
  assert.deepEqual(pending.aliasVersions, ['123', '124_vault.sql']);
  assert.equal(pending.classification, 'COMPATIBILITY_ROLLOUT_REQUIRED');
  assert.equal(classifyMigration('124_vault.sql', '', [{ version: '124_vault' }]).runnerWouldSkip, true);
});

test('does not certify unknown SQL as additive or safe and flags destructive text', () => {
  assert.equal(classifyMigration('x.sql', 'select unknown_side_effect();', []).classification, 'UNKNOWN');
  assert.equal(classifyMigration('x.sql', 'alter table x drop column y;', []).classification, 'DESTRUCTIVE_OR_BACKFILL_REVIEW_REQUIRED');
  assert.equal(classifyMigration('x.sql', '-- TRUNCATE is forbidden\nrevoke truncate on x from public;', []).classification, 'COMPATIBILITY_ROLLOUT_REQUIRED');
});
