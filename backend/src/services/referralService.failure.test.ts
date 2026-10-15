import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { applyReferralCode } from './referralService.js';

test('referral eligibility failure denies writes and a lost profile claim cannot report success', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const referrer = '22222222-2222-4222-8222-222222222222';
  const referral = '33333333-3333-4333-8333-333333333333';
  let mode = 'read-failure';
  const mutations: string[] = [];
  const server = createServer((req, res) => {
    req.resume();
    const url = new URL(req.url!, 'http://localhost');
    const table = url.pathname.split('/').at(-1);
    let status = 200;
    let result: unknown = null;
    if (req.method === 'GET') {
      if (table === 'user_referral_profiles') result = url.searchParams.has('code') ? { user_id: referrer, code: 'XROGA-ABC234' } : { user_id: owner };
      else if (mode === 'read-failure') { status = 400; result = { message: 'private database detail', code: 'XX000' }; }
    } else {
      mutations.push(req.method!);
      if (req.method === 'POST') result = { id: referral };
      if (req.method === 'PATCH') {
        assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
        assert.equal(url.searchParams.get('referred_by_user_id'), 'is.null');
      }
      if (req.method === 'DELETE') {
        assert.equal(url.searchParams.get('id'), `eq.${referral}`);
        assert.equal(url.searchParams.get('referred_id'), `eq.${owner}`);
        assert.equal(url.searchParams.get('referrer_id'), `eq.${referrer}`);
        if (mode === 'cleanup-failure') { status = 400; result = { message: 'private database detail', code: 'XX000' }; }
      }
    }
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
  });
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    await assert.rejects(applyReferralCode(owner, 'XROGA-ABC234'), /Referral eligibility unavailable/);
    assert.deepEqual(mutations, []);
    for (mode of ['lost-claim', 'cleanup-failure']) {
      mutations.length = 0;
      await assert.rejects(applyReferralCode(owner, 'XROGA-ABC234'), mode === 'lost-claim' ? /Referral link could not be completed/ : /Referral link recovery is incomplete/);
      assert.deepEqual(mutations, ['POST', 'PATCH', 'DELETE']);
    }
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
