import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { getReferralSummary } from './referralService.js';
import { createTenantContext } from '../security/tenantContext.js';

test('summary requires independent owner and code backlinks before reading referred display names', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const friend = '22222222-2222-4222-8222-222222222222';
  const foreign = '33333333-3333-4333-8333-333333333333';
  const context = createTenantContext({ userId: owner, via: 'remote_getuser' });
  let mode = 'valid', labelReads = 0;
  const server = createServer((req, res) => {
    assert.equal(req.method, 'GET');
    const url = new URL(req.url!, 'http://localhost');
    let status = 200, result: unknown;
    switch (url.pathname) {
      case '/rest/v1/user_referral_profiles':
        if (url.searchParams.has('user_id') && url.searchParams.get('user_id') === `eq.${owner}`) {
          result = { user_id: owner, code: 'XROGA-ABC234' };
        } else {
          assert.equal(url.searchParams.get('user_id'), `in.(${friend})`);
          assert.equal(url.searchParams.get('referred_by_user_id'), `eq.${owner}`);
          assert.equal(url.searchParams.get('referred_by_code'), 'eq.XROGA-ABC234');
          const link = { user_id: friend, referred_by_user_id: owner, referred_by_code: 'XROGA-ABC234' };
          result = [link];
          if (mode === 'missing') result = [];
          if (mode === 'foreign-owner') result = [{ ...link, referred_by_user_id: foreign }];
          if (mode === 'wrong-code') result = [{ ...link, referred_by_code: 'XROGA-XYZ789' }];
          if (mode === 'foreign-substitution') result = [{ ...link, user_id: foreign }];
          if (mode === 'duplicate') result = [link, link];
          if (mode === 'error') { status = 503; result = { message: 'PRIVATE_DATABASE_CANARY' }; }
        }
        break;
      case '/rest/v1/referrals':
        assert.equal(url.searchParams.get('referrer_id'), `eq.${owner}`);
        result = mode === 'empty' ? [] : [{ id: 'referral-1', referred_id: mode === 'self' ? owner : friend, code: mode === 'wrong-row-code' ? 'XROGA-XYZ789' : 'XROGA-ABC234', qualification_status: 'pending' }];
        break;
      case '/rest/v1/referral_rewards':
        assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
        assert.equal(url.searchParams.get('status'), 'eq.rewarded');
        result = [];
        break;
      case '/rest/v1/profiles':
        labelReads += 1;
        assert.equal(url.searchParams.get('select'), 'id,display_name');
        assert.equal(url.searchParams.get('id'), `in.(${friend})`);
        result = [{ id: friend, display_name: 'Linked friend' }];
        break;
      default: throw new Error(`Unexpected request ${url.pathname}`);
    }
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
  });
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    const summary = await getReferralSummary(context);
    assert.equal((summary.referrals as Array<{ referredLabel: string }>)[0].referredLabel, 'Linked friend');
    assert.equal(labelReads, 1);
    for (mode of ['missing', 'foreign-owner', 'wrong-code', 'foreign-substitution', 'duplicate', 'error', 'wrong-row-code', 'self']) {
      labelReads = 0;
      await assert.rejects(getReferralSummary(context), { message: 'Referral relationship evidence unavailable' });
      assert.equal(labelReads, 0, `${mode} must fail before sensitive label access`);
    }
    mode = 'empty';
    assert.deepEqual((await getReferralSummary(context)).referrals, []);
    assert.equal(labelReads, 0);
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
