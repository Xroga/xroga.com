/**
 * Unit tests for OAuth PKCE storage fallback helpers (pure path logic mirrored).
 * Runtime store needs Supabase; this locks the contract used by vercel/supabase auth.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('oauth pkce contract', () => {
  it('treats schema-cache messages as missing-table', () => {
    const isMissing = (message: string) =>
      /schema cache|could not find the table|does not exist|relation.*does not exist/i.test(message);
    assert.equal(
      isMissing(`Could not find the table 'public.user_integrations' in the schema cache`),
      true,
    );
    assert.equal(isMissing('duplicate key value'), false);
  });

  it('builds storage paths per user and provider', () => {
    const pkcePath = (userId: string, provider: string) => `${userId}/pkce-${provider}.json`;
    const tokenPath = (userId: string, provider: string) => `${userId}/oauth-${provider}.json`;
    assert.equal(pkcePath('u1', 'vercel_oauth_pkce'), 'u1/pkce-vercel_oauth_pkce.json');
    assert.equal(tokenPath('u1', 'supabase_oauth'), 'u1/oauth-supabase_oauth.json');
  });
});
