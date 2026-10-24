import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {test} from 'node:test';
import express from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import billingWebhookRouter from '../routes/billingWebhook.js';

export function registerBillingOwnershipTests(admin:SupabaseClient):void{
  test('real signed billing callbacks bind first owners to checkout evidence and preserve durable replay under concurrency',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const owners:string[]=[],deliveries:string[]=[];
    for(let i=0;i<2;i++){
      const result=await admin.auth.admin.createUser({email:`billing-owner-${randomUUID()}@example.invalid`,email_confirm:true});
      assert.equal(result.error,null);assert.ok(result.data.user);owners.push(result.data.user.id);
    }
    const [owner,other]=owners,account='biz_qhYONL4RebGX96',plan='plan_hlV1A10I5QfSP';
    const checkout=`ch_owner_${randomUUID()}`,payment=`pay_owner_${randomUUID()}`,membership=`mem_owner_${randomUUID()}`;
    const {WHOP_API_KEY:oldApi,WHOP_COMPANY_ID:oldCompany,WHOP_PLAN_ID:oldPlan,WHOP_REDIRECT_URL:oldRedirect,WHOP_WEBHOOK_SECRET:oldSecret}=process.env;
    const secret=`synthetic-${randomUUID()}`;
    Object.assign(process.env,{WHOP_API_KEY:'synthetic-disposable-only',WHOP_COMPANY_ID:account,WHOP_PLAN_ID:plan,WHOP_REDIRECT_URL:'https://xroga.com/workspace?billing=success',WHOP_WEBHOOK_SECRET:secret});
    const app=express();app.use('/billing',billingWebhookRouter);const server=app.listen(0,'127.0.0.1');
    await new Promise<void>(resolve=>server.once('listening',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');const callbackOrigin=`http://127.0.0.1:${address.port}`;
    t.after(async()=>{
      await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      oldApi===undefined?delete process.env.WHOP_API_KEY:process.env.WHOP_API_KEY=oldApi;
      oldCompany===undefined?delete process.env.WHOP_COMPANY_ID:process.env.WHOP_COMPANY_ID=oldCompany;
      oldPlan===undefined?delete process.env.WHOP_PLAN_ID:process.env.WHOP_PLAN_ID=oldPlan;
      oldRedirect===undefined?delete process.env.WHOP_REDIRECT_URL:process.env.WHOP_REDIRECT_URL=oldRedirect;
      oldSecret===undefined?delete process.env.WHOP_WEBHOOK_SECRET:process.env.WHOP_WEBHOOK_SECRET=oldSecret;
      if(deliveries.length)assert.equal((await admin.from('webhook_deliveries').delete().eq('provider','whop').in('delivery_id',deliveries)).error,null);
      for(const user of owners)assert.equal((await admin.auth.admin.deleteUser(user)).error,null);
    });
    const realFetch=globalThis.fetch;let providerAvailable=true,providerReads=0;
    // Only the canonical provider readback is stubbed. Raw HTTP signatures,
    // delivery claims, SQL transactions, concurrency and all receipts are real.
    // This must never be represented as live Whop provider acceptance.
    t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
      const url=new URL(String(input));
      if(url.origin==='https://api.whop.com'){
        assert.equal(url.pathname,`/api/v1/checkout_configurations/${checkout}`);assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');providerReads++;
        if(!providerAvailable)return Response.json({error:'synthetic outage'},{status:503});
        return Response.json({id:checkout,account_id:account,plan:{id:plan},mode:'payment',metadata:{xroga_user_id:owner,source:'xroga',plan_tier:'spark',xroga_checkout_id:'synthetic_server_nonce'}});
      }
      assert.ok([callbackOrigin,'http://127.0.0.1:54321'].includes(url.origin));return realFetch(input,init);
    });
    const send=async(event:unknown,delivery=`fixture_${randomUUID()}`,validSignature=true)=>{
      if(!deliveries.includes(delivery))deliveries.push(delivery);
      const raw=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000));
      const signature=createHmac('sha256',secret).update(`${delivery}.${timestamp}.${raw}`).digest('base64');
      const response=await fetch(`${callbackOrigin}/billing/whop`,{method:'POST',headers:{'content-type':'application/json','webhook-id':delivery,'webhook-timestamp':timestamp,'webhook-signature':`v1,${validSignature?signature:'invalid'}`},body:raw});
      return{status:response.status,body:await response.json() as Record<string,unknown>,delivery};
    };
    const event=(kind:'payment.succeeded'|'membership.activated',user:string,id=kind==='payment.succeeded'?payment:membership)=>({type:kind,account_id:account,data:{id,status:kind==='payment.succeeded'?'succeeded':'active',plan_id:plan,checkout_configuration_id:checkout,paid_at:new Date().toISOString(),metadata:{xroga_user_id:user,source:'xroga',plan_tier:'spark'}}});
    const rows=async(table:string)=>{const result=await admin.from(table).select('*').in('user_id',owners);assert.equal(result.error,null);return(result.data??[]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));};
    const delivery=async(id:string)=>{const result=await admin.from('webhook_deliveries').select('*').eq('provider','whop').eq('delivery_id',id).maybeSingle();assert.equal(result.error,null);return result.data;};
    const tables=['whop_payment_fulfillments','whop_memberships','xroga_billing_cycles','user_actions','action_transactions','user_token_usage'];
    const before=await Promise.all(tables.map(rows));
    for(const kind of ['payment.succeeded','membership.activated'] as const){
      const denied=await send(event(kind,other));assert.equal(denied.status,500);
      const receipt=await delivery(denied.delivery);assert.equal(receipt?.status,'failed');assert.equal(receipt?.safe_error,kind==='payment.succeeded'?'payment_owner_mismatch':'membership_owner_mismatch');
      assert.deepEqual(await Promise.all(tables.map(rows)),before,'Foreign first claims leave every billing and budget row unchanged');
    }
    const invalid=await send(event('payment.succeeded',owner),undefined,false);assert.equal(invalid.status,401);assert.equal(await delivery(invalid.delivery),null);
    const intent=event('payment.succeeded',owner);
    const outcomes=await Promise.all([send(intent),send(intent)]);assert.ok(outcomes.every(result=>result.status===200));
    assert.deepEqual(outcomes.map(result=>result.body.fulfilled).sort(),[false,true]);
    const paid=await rows('whop_payment_fulfillments');assert.equal(paid.length,1);assert.equal(paid[0].user_id,owner);assert.equal(paid[0].whop_payment_id,payment);assert.equal(paid[0].provider_reference,`whop:payment:${payment}`);assert.equal(new Date(paid[0].starts_at).getTime(),new Date(intent.data.paid_at).getTime());
    const cycles=await rows('xroga_billing_cycles');assert.equal(cycles?.filter(row=>row.user_id===owner&&row.cycle_kind==='paid').length,1);
    const snapshot=await Promise.all(tables.map(rows)),readsBeforeReplay=providerReads;
    providerAvailable=false;
    const duplicate=await send(intent,outcomes[0].delivery);assert.equal(duplicate.status,200);assert.equal(duplicate.body.duplicate,true);
    assert.equal((await send(intent)).body.fulfilled,false);assert.equal(providerReads,readsBeforeReplay);
    assert.deepEqual(await Promise.all(tables.map(rows)),snapshot,'Duplicate deliveries and new-delivery payment replay cannot reset budgets');
    providerAvailable=true;
    assert.equal((await send(event('membership.activated',owner))).status,200);
    const member=await rows('whop_memberships');assert.equal(member?.length,1);assert.equal(member[0].user_id,owner);assert.equal(member[0].whop_membership_id,membership);assert.equal(member[0].whop_checkout_configuration_id,checkout);assert.equal(member[0].whop_account_id,account);assert.equal(member[0].whop_plan_id,plan);
    const foreignUpdate=await send(event('membership.activated',other));assert.equal(foreignUpdate.status,500);assert.deepEqual(await rows('whop_memberships'),member);
    const retryIntent=event('payment.succeeded',owner,`pay_retry_${randomUUID()}`);providerAvailable=false;
    const failed=await send(retryIntent);assert.equal(failed.status,500);assert.equal((await delivery(failed.delivery))?.status,'failed');assert.deepEqual(await rows('whop_payment_fulfillments'),paid);
    providerAvailable=true;const recovered=await send(retryIntent,failed.delivery);assert.equal(recovered.status,200);assert.equal(recovered.body.fulfilled,true);assert.equal((await delivery(failed.delivery))?.status,'completed');
  });
}
