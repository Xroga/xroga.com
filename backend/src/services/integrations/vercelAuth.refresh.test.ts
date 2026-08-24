import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isVercelAccessTokenExpiring, parseVercelRefreshLease } from './vercelAuth.js';

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

describe('Vercel distributed refresh lease', () => {
  it('ignores ordinary refresh tokens', () => {
    assert.equal(parseVercelRefreshLease('ordinary-refresh-token'), null);
  });

  it('rejects malformed lease markers without exposing their contents', () => {
    assert.equal(parseVercelRefreshLease('xroga-refresh-lease:not-base64-json'), null);
  });

  it('parses a complete lease marker used for cross-machine exclusion', () => {
    const payload = Buffer.from(JSON.stringify({
      claimId: 'claim-1',
      expiresAt: 1_800_000_000_000,
      refreshToken: 'rotating-token',
    })).toString('base64url');

    assert.deepEqual(parseVercelRefreshLease(`xroga-refresh-lease:${payload}`), {
      claimId: 'claim-1',
      expiresAt: 1_800_000_000_000,
      refreshToken: 'rotating-token',
    });
  });
});
