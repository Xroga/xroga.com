import assert from 'node:assert/strict';
import test from 'node:test';
import { canReadMessageShare } from './messageShares.js';

test('public shares open without a session', () => {
  assert.equal(canReadMessageShare('public', 'owner-a'), true);
});

test('private shares only open for their verified owner', () => {
  assert.equal(canReadMessageShare('private', 'owner-a'), false);
  assert.equal(canReadMessageShare('private', 'owner-a', 'owner-b'), false);
  assert.equal(canReadMessageShare('private', 'owner-a', 'owner-a'), true);
});
