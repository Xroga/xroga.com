import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOAuthState, verifyOAuthState } from './oauthState.js';

describe('OAuth state', () => {
  it('accepts a signed, unexpired state for the requesting user', () => {
    const state = createOAuthState('user-a', 'server-secret', 1_000);
    assert.equal(verifyOAuthState(state, 'user-a', 'server-secret', 2_000), true);
  });

  it('rejects tampering, cross-user reuse, expiration, and a different secret', () => {
    const state = createOAuthState('user-a', 'server-secret', 1_000);
    assert.equal(verifyOAuthState(`${state}x`, 'user-a', 'server-secret', 2_000), false);
    assert.equal(verifyOAuthState(state, 'user-b', 'server-secret', 2_000), false);
    assert.equal(verifyOAuthState(state, 'user-a', 'server-secret', 1_000 + 10 * 60_000 + 1), false);
    assert.equal(verifyOAuthState(state, 'user-a', 'different-secret', 2_000), false);
  });
});
