import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createGoogleOneTapNonce } from './googleOneTapNonce';

test('Google One Tap uses a unique raw nonce and sends only its hash to Google', async () => {
  const first = await createGoogleOneTapNonce();
  const second = await createGoogleOneTapNonce();
  assert.match(first.raw, /^[a-f0-9]{64}$/);
  assert.equal(first.hashed, createHash('sha256').update(first.raw).digest('hex'));
  assert.notEqual(first.raw, first.hashed);
  assert.notEqual(first.raw, second.raw);
});
