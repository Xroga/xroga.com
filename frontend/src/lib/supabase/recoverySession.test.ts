import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RECOVERY_PATH, recoveryReady, redeemAuthCallback, type CallbackAuth } from './recoverySession';

/** A stand-in for Supabase that remembers redeemed links, so replay really fails like the real service. */
function fakeAuth(options: { validCodes?: string[]; validHashes?: string[]; userId?: string } = {}) {
  const usedCodes = new Set<string>();
  const usedHashes = new Set<string>();
  const user = { id: options.userId ?? 'user-1' };
  const calls: string[] = [];
  const auth: CallbackAuth = {
    async exchangeCodeForSession(code) {
      calls.push(`code:${code}`);
      if (!(options.validCodes ?? []).includes(code) || usedCodes.has(code)) return { data: null, error: new Error('invalid') };
      usedCodes.add(code);
      return { data: { user }, error: null };
    },
    async verifyOtp({ token_hash, type }) {
      calls.push(`otp:${token_hash}:${type}`);
      if (type !== 'recovery' || !(options.validHashes ?? []).includes(token_hash) || usedHashes.has(token_hash)) return { data: null, error: new Error('expired') };
      usedHashes.add(token_hash);
      return { data: { user }, error: null };
    },
  };
  return { auth, calls };
}
const base = { code: null, tokenHash: null, type: null, next: RECOVERY_PATH } as const;

test('default PKCE code callback lands on the reset page with a marker for exactly that user', async () => {
  const { auth } = fakeAuth({ validCodes: ['c1'], userId: 'u-9' });
  const outcome = await redeemAuthCallback({ ...base, code: 'c1' }, auth);
  assert.deepEqual(outcome, { kind: 'redirect', path: RECOVERY_PATH, recoveryUserId: 'u-9', checkPhonePrompt: false });
});

test('recovery token_hash callback is redeemed once, on the server, and also issues the marker', async () => {
  const { auth, calls } = fakeAuth({ validHashes: ['h1'] });
  const outcome = await redeemAuthCallback({ ...base, tokenHash: 'h1', type: 'recovery' }, auth);
  assert.equal(outcome.kind, 'redirect');
  assert.equal(outcome.kind === 'redirect' && outcome.recoveryUserId, 'user-1');
  assert.deepEqual(calls, ['otp:h1:recovery']);
});

test('replayed, expired, invalid and unauthorized links fail closed to the login error', async () => {
  const { auth } = fakeAuth({ validCodes: ['c1'], validHashes: ['h1'] });
  await redeemAuthCallback({ ...base, code: 'c1' }, auth);
  const replay = await redeemAuthCallback({ ...base, code: 'c1' }, auth);
  const expired = await redeemAuthCallback({ ...base, tokenHash: 'nope', type: 'recovery' }, auth);
  const noParams = await redeemAuthCallback({ ...base }, auth);
  const wrongType = await redeemAuthCallback({ ...base, tokenHash: 'h1', type: 'magiclink' }, auth);
  const noType = await redeemAuthCallback({ ...base, tokenHash: 'h1', type: null }, auth);
  for (const outcome of [replay, expired, noParams, wrongType, noType]) assert.deepEqual(outcome, { kind: 'failed', path: '/auth/login?error=auth_callback_failed' });
});

test('a provider that throws is a failed callback, never an opened reset form', async () => {
  const auth: CallbackAuth = { async exchangeCodeForSession() { throw new Error('network'); }, async verifyOtp() { throw new Error('network'); } };
  assert.equal((await redeemAuthCallback({ ...base, code: 'x' }, auth)).kind, 'failed');
});

test('an ordinary sign-in callback never gets a recovery marker and keeps the phone-prompt check', async () => {
  const { auth } = fakeAuth({ validCodes: ['c2'] });
  const outcome = await redeemAuthCallback({ ...base, code: 'c2', next: '/workspace' }, auth);
  assert.deepEqual(outcome, { kind: 'redirect', path: '/workspace', checkPhonePrompt: true });
});

test('an unsafe next path cannot send a verified user off-site', async () => {
  const { auth } = fakeAuth({ validCodes: ['c3'] });
  for (const next of ['//evil.example', 'https://evil.example', '/\\evil']) {
    const fresh = fakeAuth({ validCodes: ['c3'] });
    const outcome = await redeemAuthCallback({ ...base, code: 'c3', next }, fresh.auth);
    assert.equal(outcome.kind === 'redirect' && outcome.path, '/dashboard');
    assert.equal(outcome.kind === 'redirect' && outcome.recoveryUserId, undefined);
  }
  void auth;
});

test('the reset form opens only for the user who redeemed the link, and never for a plain signed-in session', () => {
  assert.equal(recoveryReady('u-1', 'u-1'), true);
  assert.equal(recoveryReady('u-1', undefined), false, 'signed-in user without a marker');
  assert.equal(recoveryReady('u-2', 'u-1'), false, 'different user than the one verified');
  assert.equal(recoveryReady(null, 'u-1'), false, 'no session');
  assert.equal(recoveryReady(undefined, undefined), false);
});
