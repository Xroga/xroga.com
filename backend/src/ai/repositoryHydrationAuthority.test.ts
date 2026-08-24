import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectMemoryMatchesRemoteHead } from './pipeline.js';

test('uncommitted failed-run memory can never stand in for an empty or unknown repository', () => {
  assert.equal(projectMemoryMatchesRemoteHead(undefined, undefined), false);
  assert.equal(projectMemoryMatchesRemoteHead(undefined, 'a'.repeat(40)), false);
});

test('memory from a different GitHub head is stale', () => {
  assert.equal(projectMemoryMatchesRemoteHead('a'.repeat(40), 'b'.repeat(40)), false);
});

test('memory is reusable only for the exact authoritative GitHub head', () => {
  const sha = 'AdFe19ff104ba8815d01882bdf90f62fa5db5a09';
  assert.equal(projectMemoryMatchesRemoteHead(sha, sha.toLowerCase()), true);
});
