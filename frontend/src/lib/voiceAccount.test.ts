import assert from 'node:assert/strict';
import test from 'node:test';
import {sameVoiceAccount} from './voiceRequestPolicy';

const jwt = (claims: object) => 'x.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.y';
const base = {sub: 'user-1', session_id: 'session-1', iss: 'https://auth.example'};

test('a refreshed access token for the same signed-in session is the same account', () => {
  assert.equal(sameVoiceAccount(jwt({...base, exp: 1}), jwt({...base, exp: 2, name: 'Zoë'})), true);
  assert.equal(sameVoiceAccount('opaque', 'opaque'), true);
});

test('another user, session or issuer, a sign-out and unreadable tokens are a different account', () => {
  const original = jwt(base);
  for (const other of [jwt({...base, sub: 'user-2'}), jwt({...base, session_id: 'session-2'}), jwt({...base, iss: 'https://other.example'}),
    jwt({sub: 'user-1'}), jwt({}), 'different-account-token', 'a.b.c', '', null]) assert.equal(sameVoiceAccount(original, other), false);
  assert.equal(sameVoiceAccount(jwt({sub: 'user-1'}), jwt({sub: 'user-1', exp: 2})), false);
  assert.equal(sameVoiceAccount('opaque', 'other'), false);
});
