import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { applyReferralCode, getReferralSummary } from './referralService.js';
import { createTenantContext, type TenantContext } from '../security/tenantContext.js';

test('referral eligibility failure denies writes and only an exact atomic receipt reports success', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const context = createTenantContext({ userId: owner, via: 'remote_getuser' });
  let mode = 'read-failure';
  const mutations: string[] = [];
  const server = createServer((req, res) => {
    let body = ''; req.on('data', part => { body += part; });
    req.on('end', () => {
      const url = new URL(req.url!, 'http://localhost');
      let status = 200, result: unknown = { user_id: owner };
      if (req.method === 'GET') {
        assert.equal(url.pathname, '/rest/v1/user_referral_profiles');
        assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
        if (mode === 'read-failure') { status = 503; result = { message: 'PRIVATE_CANARY' }; }
      } else {
        mutations.push(req.method!);
        assert.equal(req.method, 'POST');
        assert.equal(url.pathname, '/rest/v1/rpc/apply_referral_code_atomic');
        assert.deepEqual(JSON.parse(body), { p_owner_id: owner, p_code: 'XROGA-ABC234' });
        if (mode === 'rpc-failure') { status = 503; result = { message: 'PRIVATE_CANARY' }; }
        else result = mode === 'empty' ? null : mode === 'malformed' ? { recorded: true } : mode;
      }
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
    });
  });
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    for (const fake of [owner, { ...context }, { userId: owner }, null]) {
      await assert.rejects(applyReferralCode(fake as TenantContext, 'XROGA-ABC234'), { code: 'TENANT_AUTH_REQUIRED' });
      await assert.rejects(getReferralSummary(fake as TenantContext), { code: 'TENANT_AUTH_REQUIRED' });
    }
    await assert.rejects(applyReferralCode(context, 'XROGA-ABC234'), /Referral profile unavailable/);
    assert.deepEqual(mutations, []);
    for (mode of ['rpc-failure', 'empty', 'malformed', 'profile_unavailable', 'unknown']) {
      mutations.length = 0;
      await assert.rejects(applyReferralCode(context, 'XROGA-ABC234'), error => error instanceof Error && /Referral/.test(error.message) && !error.message.includes('CANARY'));
      assert.deepEqual(mutations, ['POST']);
    }
    for (mode of ['recorded', 'already_linked', 'not_found', 'self_referral']) {
      mutations.length = 0;
      assert.equal((await applyReferralCode(context, ' xroga-abc234 ')).success, mode === 'recorded');
      assert.deepEqual(mutations, ['POST']);
    }
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
