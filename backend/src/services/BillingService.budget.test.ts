import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BillingService } from './BillingService.js';
import { syncPlanBudget } from '../ai/quota.js';

test('billing leaves durable budget changes inside canonical transactions and propagates synchronization failure', async t => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY','WHOP_API_KEY','WHOP_COMPANY_ID','WHOP_PLAN_ID','WHOP_REDIRECT_URL']; const prior = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; }));
  process.env.SUPABASE_URL = 'http://127.0.0.1:49193'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
  Object.assign(process.env,{WHOP_API_KEY:'synthetic',WHOP_COMPANY_ID:'biz_qhYONL4RebGX96',WHOP_PLAN_ID:'plan_hlV1A10I5QfSP',WHOP_REDIRECT_URL:'https://xroga.com/workspace?billing=success'});
  const owner = '11111111-1111-4111-8111-111111111111';
  let fulfilled = true, mode = 'ok'; const calls: string[] = [];
  let recorded=false,checkoutReads=0;
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    if(url.origin==='https://api.whop.com'){
      assert.equal(url.pathname,'/api/v1/checkout_configurations/ch_budget_fixture');checkoutReads++;
      return Response.json({id:'ch_budget_fixture',account_id:'biz_qhYONL4RebGX96',plan:{id:'plan_hlV1A10I5QfSP'},mode:'payment',metadata:{xroga_user_id:owner,source:'xroga',plan_tier:'spark',xroga_checkout_id:'fixture_nonce'}});
    }
    assert.equal(url.origin, 'http://127.0.0.1:49193'); calls.push(url.pathname);
    if (url.pathname.endsWith('/set_user_ai_plan_budget')) {
      if (mode === 'transport') throw new Error('PRIVATE');
      if (mode === 'error') return Response.json({ message: 'PRIVATE' }, { status: 503 });
      assert.equal(JSON.parse(String(init?.body)).p_user_id, owner); return Response.json(null);
    }
    if (url.pathname.endsWith('/profiles')) return Response.json({ id: owner });
    if (url.pathname.endsWith('/whop_payment_fulfillments'))return Response.json(recorded?{user_id:owner,whop_payment_id:'payment'}:null);
    if (url.pathname.endsWith('/fulfill_whop_payment')) {recorded=true;return Response.json(fulfilled);}
    if (url.pathname.endsWith('/whop_memberships')) {
      if(init?.method==='POST'||init?.method==='PATCH'){
        const row=JSON.parse(String(init.body));assert.equal(row.whop_plan_id,'plan_hlV1A10I5QfSP');assert.equal(row.whop_account_id,'biz_qhYONL4RebGX96');
        return Response.json(init.method==='PATCH'?{whop_membership_id:'old'}:null);
      }
      return Response.json({user_id:owner,whop_membership_id:'old',whop_plan_id:'plan_hlV1A10I5QfSP',whop_account_id:'biz_qhYONL4RebGX96'});
    }
    if (url.pathname.endsWith('/ensure_xroga_free_cycle')) return Response.json(null);
    if (url.pathname.endsWith('/xroga_billing_cycles')) return Response.json({ cycle_kind: 'paid', status: 'active', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 86400000).toISOString(), entitlement_micro_usd: 16500000, pacing: 'balanced_month', settled_micro_usd: 0, reserved_micro_usd: 0, accounting_safety_hold_micro_usd: 0, accelerated_unlock_micro_usd: 0 });
    throw new Error(`Unexpected ${url.pathname}`);
  });
  const payment = { type: 'payment.succeeded' as const, account_id: 'biz_qhYONL4RebGX96', data: { id: 'payment', status: 'succeeded',checkout_configuration_id:'ch_budget_fixture', plan_id: 'plan_hlV1A10I5QfSP', metadata: { xroga_user_id: owner, source: 'xroga', plan_tier: 'spark' } } };
  for (fulfilled of [true, false]) {
    calls.length = 0; assert.deepEqual(await BillingService.handleWebhookEvent(payment, 'delivery'), { fulfilled });
    assert.deepEqual(calls, ['/rest/v1/whop_payment_fulfillments','/rest/v1/profiles', '/rest/v1/rpc/fulfill_whop_payment']);
  }
  assert.equal(checkoutReads,1,'Durable replay does not depend on another provider request');
  calls.length = 0;
  await BillingService.handleWebhookEvent({ type: 'membership.deactivated', account_id: 'biz_qhYONL4RebGX96', data: { id: 'old', metadata: { xroga_user_id: owner } } }, 'deactivation');
  assert.ok(calls.includes('/rest/v1/rpc/ensure_xroga_free_cycle'));
  assert.equal(calls.some(call => call.endsWith('/set_user_ai_plan_budget')), false);
  for (mode of ['error', 'transport']) await assert.rejects(syncPlanBudget(owner, 'spark'), { code: 'QUOTA_UNAVAILABLE', message: 'AI usage could not be verified. Retry shortly.' });
  mode = 'ok'; await syncPlanBudget(owner, 'spark');
  const before = calls.length; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await syncPlanBudget(owner, 'free'); assert.equal(calls.length, before);
});
