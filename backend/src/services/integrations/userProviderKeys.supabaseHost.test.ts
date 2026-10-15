import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProviderEnvForDeploy, saveUserProviderKey } from './userProviderKeys.js';
import { projectRefFromUrl } from './supabaseProjectUrl.js';

test('Supabase vault saves and final deployment maps reject non-project origins including legacy and custom overrides', async () => {
  const invalid = [
    'https://attacker.invalid', 'https://127.0.0.1', 'https://169.254.169.254',
    'https://user:password@project.supabase.co', 'https://project.supabase.co:444',
    'https://project.supabase.co.attacker.invalid', 'https://extra.project.supabase.co',
    'https://project.supabase.co/rest/v1', 'https://project.supabase.co?target=other',
    'https://project.supabase.co#fragment', 'http://project.supabase.co',
  ];
  const owner = '11111111-1111-4111-8111-111111111111';
  const originalFetch = globalThis.fetch;
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const before = names.map(name => process.env[name]);
  process.env.SUPABASE_URL = 'https://vault-fixture.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  let calls = 0;
  let rows: unknown[] = [];
  globalThis.fetch = async input => {
    calls++;
    const url = new URL(String(input instanceof Request ? input.url : input));
    assert.equal(url.origin, 'https://vault-fixture.invalid');
    assert.equal(url.pathname, '/rest/v1/user_integrations');
    assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
    return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
  };
  const row = (provider: string, env: string, value: string) => ({ provider, access_token: `enc:${Buffer.from(`fixture:${value}`).toString('base64')}`, metadata: { env_var: env } });
  try {
    for (const url of invalid) {
      assert.equal(projectRefFromUrl(url), null);
      await assert.rejects(saveUserProviderKey(owner, 'supabase_url', url), /hosted/);
    }
    assert.equal(calls, 0, 'Invalid destinations never reach admission, storage or persistence');
    for (const url of invalid) {
      const service = row('apikey_supabase', 'SUPABASE_SERVICE_ROLE_KEY', 'SYNTHETIC_RETAINED_SERVICE');
      rows = [row('apikey_supabase_url', 'NEXT_PUBLIC_SUPABASE_URL', url), service];
      await assert.rejects(resolveProviderEnvForDeploy(owner), /not a verified hosted project origin/);
      rows = [row('apikey_supabase_url', 'NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co'), service,
        row('apikey_custom_next_public_supabase_url', 'NEXT_PUBLIC_SUPABASE_URL', url)];
      await assert.rejects(resolveProviderEnvForDeploy(owner), /not a verified hosted project origin/);
    }
    rows = [row('apikey_supabase_url', 'NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co'),
      row('apikey_supabase', 'SUPABASE_SERVICE_ROLE_KEY', 'SYNTHETIC_RETAINED_SERVICE')];
    assert.deepEqual(await resolveProviderEnvForDeploy(owner), {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'SYNTHETIC_RETAINED_SERVICE',
    });
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index]; });
  }
});
