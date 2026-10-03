import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reconcileAssistantText } from './streamText';

test('reconnect replaces a partial prefix with the complete persisted answer', () => {
  assert.equal(reconcileAssistantText('The result is par', 'The result is complete.'), 'The result is complete.');
});

test('continuation appends only the non-overlapping suffix', () => {
  assert.equal(reconcileAssistantText('One sentence. Second', 'Second sentence. Third.'), 'One sentence. Second sentence. Third.');
});

test('identical replay cannot duplicate the logical answer', () => {
  assert.equal(reconcileAssistantText('Already complete.', 'Already complete.'), 'Already complete.');
});
