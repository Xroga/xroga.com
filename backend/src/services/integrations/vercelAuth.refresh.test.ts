import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isVercelAccessTokenExpiring } from './vercelAuth.js';

describe('Vercel OAuth token expiry', () => {
  const now = Date.parse('2026-08-24T12:00:00.000Z');

  it('refreshes a token that expires inside the safety window', () => {
    assert.equal(
      isVercelAccessTokenExpiring('2026-08-24T12:00:30.000Z', now),
      true,
    );
  });

  it('keeps a token that remains valid beyond the safety window', () => {
    assert.equal(
      isVercelAccessTokenExpiring('2026-08-24T12:05:00.000Z', now),
      false,
    );
  });

  it('keeps legacy tokens without an expiry timestamp', () => {
    assert.equal(isVercelAccessTokenExpiring(undefined, now), false);
  });

  it('does not classify malformed metadata as a known-expired token', () => {
    assert.equal(isVercelAccessTokenExpiring('not-a-date', now), false);
  });
});
