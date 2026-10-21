import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BillingService } from './BillingService.js';

export function registerBillingBudgetTests(admin: SupabaseClient): void {
  test('real old membership deactivation preserves a newer paid cycle and expired replay keeps canonical free budget', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const created = await admin.auth.admin.createUser({ email: `billing-budget-${randomUUID()}@example.invalid`, email_confirm: true });
    assert.equal(created.error, null); assert.ok(created.data.user); const owner = created.data.user.id;
    t.after(async () => { assert.equal((await admin.auth.admin.deleteUser(owner)).error, null); });
    const old = `old-${randomUUID()}`, paymentId = `paid-${randomUUID()}`;
    const checkoutId=`ch_budget_${randomUUID()}`;
    const {WHOP_API_KEY:oldApi,WHOP_COMPANY_ID:oldCompany,WHOP_PLAN_ID:oldPlan,WHOP_REDIRECT_URL:oldRedirect}=process.env;
    Object.assign(process.env,{WHOP_API_KEY:'synthetic-disposable-only',WHOP_COMPANY_ID:'biz_qhYONL4RebGX96',WHOP_PLAN_ID:'plan_hlV1A10I5QfSP',WHOP_REDIRECT_URL:'https://xroga.com/workspace?billing=success'});
    t.after(()=>{
      oldApi===undefined?delete process.env.WHOP_API_KEY:process.env.WHOP_API_KEY=oldApi;
      oldCompany===undefined?delete process.env.WHOP_COMPANY_ID:process.env.WHOP_COMPANY_ID=oldCompany;
      oldPlan===undefined?delete process.env.WHOP_PLAN_ID:process.env.WHOP_PLAN_ID=oldPlan;
      oldRedirect===undefined?delete process.env.WHOP_REDIRECT_URL:process.env.WHOP_REDIRECT_URL=oldRedirect;
    });
    const realFetch=globalThis.fetch;let checkoutReads=0;
    // Provider receipt is synthetic. Auth, SQL, replay and budget persistence are real disposable Supabase.
    t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
      const url=new URL(String(input));
      if(url.origin==='https://api.whop.com'){
        assert.equal(url.pathname,`/api/v1/checkout_configurations/${checkoutId}`);assert.equal(init?.method,'GET');checkoutReads++;
        return Response.json({id:checkoutId,account_id:'biz_qhYONL4RebGX96',plan:{id:'plan_hlV1A10I5QfSP'},mode:'payment',metadata:{xroga_user_id:owner,source:'xroga',plan_tier:'spark',xroga_checkout_id:'synthetic_nonce'}});
      }
      assert.equal(url.origin,'http://127.0.0.1:54321');return realFetch(input,init);
    });
    assert.equal((await admin.from('whop_memberships').insert({ user_id: owner, whop_membership_id: old, status: 'active', billing_provider: 'whop', whop_plan_id: 'plan_hlV1A10I5QfSP', whop_account_id: 'biz_qhYONL4RebGX96' })).error, null);
    const payment = { type: 'payment.succeeded' as const, account_id: 'biz_qhYONL4RebGX96', data: { id: paymentId, status: 'succeeded',checkout_configuration_id:checkoutId, plan_id: 'plan_hlV1A10I5QfSP', paid_at: new Date().toISOString(), metadata: { xroga_user_id: owner, source: 'xroga', plan_tier: 'spark' } } };
    assert.deepEqual(await BillingService.handleWebhookEvent(payment, randomUUID()), { fulfilled: true });
    const budget = async () => { const row = await admin.from('user_token_usage').select('plan_tier,plan_budget_usd').eq('user_id', owner).single(); assert.equal(row.error, null); return row.data!; };
    assert.equal((await budget()).plan_tier, 'spark'); assert.equal(Number((await budget()).plan_budget_usd), 20);
    const event = { type: 'membership.deactivated' as const, account_id: 'biz_qhYONL4RebGX96', data: { id: old, metadata: { xroga_user_id: owner } } };
    await BillingService.handleWebhookEvent(event, randomUUID());
    assert.equal((await budget()).plan_tier, 'spark'); assert.equal(Number((await budget()).plan_budget_usd), 20);
    const active = await admin.from('xroga_billing_cycles').select('id,cycle_kind').eq('user_id', owner).eq('status', 'active').single();
    assert.equal(active.error, null); assert.equal(active.data?.cycle_kind, 'paid');
    assert.equal((await admin.from('xroga_billing_cycles').update({ starts_at: new Date(Date.now() - 2 * 86400000).toISOString(), ends_at: new Date(Date.now() - 86400000).toISOString() }).eq('id', active.data!.id)).error, null);
    await BillingService.handleWebhookEvent(event, randomUUID());
    assert.equal((await budget()).plan_tier, 'free'); assert.equal(Number((await budget()).plan_budget_usd), 1.65);
    assert.deepEqual(await BillingService.handleWebhookEvent(payment, randomUUID()), { fulfilled: false });
    assert.equal(checkoutReads,1,'Persisted payment replay remains independent of a second provider lookup');
    await BillingService.handleWebhookEvent(event, randomUUID());
    assert.equal((await budget()).plan_tier, 'free'); assert.equal(Number((await budget()).plan_budget_usd), 1.65);
    const free = await admin.from('xroga_billing_cycles').select('id,cycle_kind').eq('user_id', owner).eq('status', 'active');
    assert.equal(free.error, null); assert.equal(free.data?.length, 1); assert.equal(free.data![0].cycle_kind, 'free');
  });
}
