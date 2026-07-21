import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { vercelOAuthScope } from './vercelAuth.js';

describe('vercelOAuthScope', () => {
  const prev = process.env.VERCEL_OAUTH_SCOPES;

  afterEach(() => {
    if (prev === undefined) delete process.env.VERCEL_OAUTH_SCOPES;
    else process.env.VERCEL_OAUTH_SCOPES = prev;
  });

  beforeEach(() => {
    delete process.env.VERCEL_OAUTH_SCOPES;
  });

  it('omits scope when env empty (use App defaults)', () => {
    assert.equal(vercelOAuthScope(), '');
  });

  it('keeps valid space-separated OIDC scopes', () => {
    process.env.VERCEL_OAUTH_SCOPES = 'openid email profile offline_access';
    assert.equal(vercelOAuthScope(), 'openid email profile offline_access');
  });

  it('accepts commas and drops invalid API permission names', () => {
    process.env.VERCEL_OAUTH_SCOPES = 'openid, deployments, project, email';
    assert.equal(vercelOAuthScope(), 'openid email');
  });

  it('returns empty when only malformed junk', () => {
    process.env.VERCEL_OAUTH_SCOPES = 'deployments read-write, *';
    assert.equal(vercelOAuthScope(), '');
  });
});
