import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizedReadToolArguments } from './businessRead.js';

test('read-only tool selection accepts one safe argument key, including provider input alias', () => {
  assert.deepEqual(normalizedReadToolArguments({ toolSlug: 'GMAIL_GET_UNREAD_COUNT', arguments: {} }), {});
  assert.deepEqual(normalizedReadToolArguments({ toolSlug: 'GMAIL_GET_UNREAD_COUNT', input: {} }), {});
  assert.equal(normalizedReadToolArguments({ toolSlug: 'GMAIL_GET_UNREAD_COUNT', arguments: {}, input: {} }), null);
  assert.equal(normalizedReadToolArguments({ toolSlug: 'GMAIL_GET_UNREAD_COUNT' }), null);
  assert.equal(normalizedReadToolArguments({ input: [] }), null);
  assert.equal(normalizedReadToolArguments({ input: JSON.parse('{"__proto__":{"admin":true}}') }), null);
});
