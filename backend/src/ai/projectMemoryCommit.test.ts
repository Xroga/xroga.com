import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProjectMemoryCommitSha } from './projectMemory.js';

test('omitting a commit acknowledgement preserves the prior remote head', () => {
  assert.equal(resolveProjectMemoryCommitSha(undefined, 'abc1234', false), 'abc1234');
});

test('an explicitly uncommitted snapshot clears the prior remote head', () => {
  assert.equal(resolveProjectMemoryCommitSha(null, 'abc1234', true), undefined);
});

test('a verified push replaces the prior remote head', () => {
  assert.equal(resolveProjectMemoryCommitSha('def5678', 'abc1234', true), 'def5678');
});
