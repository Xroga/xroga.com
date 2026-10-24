import assert from 'node:assert/strict';
import test from 'node:test';
import { previewBusinessActionArguments } from './businessActionConfirmations.js';

test('confirmation preview retains destinations and body but redacts credential keys', () => {
  const preview = previewBusinessActionArguments({
    recipient: 'lead@example.com',
    content: 'Hello',
    nested: { access_token: 'secret-value', rows: [{ email: 'other@example.com' }] },
  });
  assert.match(preview, /lead@example.com/);
  assert.match(preview, /other@example.com/);
  assert.doesNotMatch(preview, /secret-value/);
  assert.match(preview, /\[redacted\]/);
});
