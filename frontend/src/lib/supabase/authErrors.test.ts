import assert from 'node:assert/strict';
import test from 'node:test';
import { safeAuthError, withAuthTimeout } from './authErrors';

test('maps configuration and provider failures to safe actionable messages', () => {
  assert.equal(
    safeAuthError(new Error('Supabase public configuration is missing'), 'fallback'),
    'Authentication is temporarily unavailable. Please try again shortly.'
  );
  assert.equal(
    safeAuthError(new Error('Unsupported provider: provider is not enabled'), 'fallback'),
    'GitHub sign-in is not configured yet.'
  );
  assert.equal(
    safeAuthError(new Error('Signups not allowed for this instance'), 'fallback'),
    'New account registration is temporarily unavailable.'
  );
});

test('does not expose unknown provider errors', () => {
  assert.equal(safeAuthError(new Error('internal upstream detail'), 'Sign in failed.'), 'Sign in failed.');
});

test('bounds stalled authentication provider requests', async () => {
  await assert.rejects(withAuthTimeout(new Promise<never>(() => undefined), 5), /timed out/);
});
