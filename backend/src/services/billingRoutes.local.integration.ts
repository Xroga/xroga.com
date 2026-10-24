import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';

/** Prepared integration coverage, not provider activation or paid execution. */
export function registerBillingRouteTests(admin:SupabaseClient,request:(path:string,token?:string,method?:string,body?:unknown)=>Promise<Response>):void{
  test('real billing routes use the authenticated owner for status pacing and management regardless of forged body identity',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const actors:{id:string;token:string}[]=[];
    t.after(async()=>{for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);});
    for(let i=0;i<2;i++){
      const email=`billing-route-${randomUUID()}@example.invalid`,password=`Synthetic-${randomUUID()}!`;
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);
      const client:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
      const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.ok(signed.data.session);
      actors.push({id:created.data.user.id,token:signed.data.session.access_token});
    }
    const [owner,other]=actors;
    const delivery=`fixture_route_${randomUUID()}`;
    const receipt=await admin.from('webhook_deliveries').insert({provider:'whop',delivery_id:delivery,payload_digest:'0'.repeat(64),user_id:owner.id,status:'failed',signature_verified:true}).select('*').single();assert.equal(receipt.error,null);
    t.after(async()=>{assert.equal((await admin.from('webhook_deliveries').delete().eq('provider','whop').eq('delivery_id',delivery)).error,null);});
    for(const token of [undefined,owner.token,other.token]){
      const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{autoRefreshToken:false,persistSession:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
      const read=await browser.from('webhook_deliveries').select('*').eq('provider','whop').eq('delivery_id',delivery);
      if(read.error)assert.equal(read.error.code,'42501');else assert.deepEqual(read.data,[]);
      const forgedReceipt=await browser.from('webhook_deliveries').insert({provider:'whop',delivery_id:`forged_${randomUUID()}`,payload_digest:'0'.repeat(64),user_id:owner.id,status:'completed',signature_verified:true});assert.equal(forgedReceipt.error?.code,'42501');
      for(const target of actors){
        const deniedPaid=await browser.rpc('activate_xroga_paid_cycle',{p_user_id:target.id,p_provider_reference:`denied-${randomUUID()}`,p_starts_at:new Date().toISOString(),p_ends_at:new Date(Date.now()+86400000).toISOString()});
        assert.equal(deniedPaid.error?.code,'42501','A browser identity cannot mint paid authority for itself or a different tenant');
      }
      for(const result of [await browser.from('webhook_deliveries').update({status:'completed'}).eq('provider','whop').eq('delivery_id',delivery).select('delivery_id'),await browser.from('webhook_deliveries').delete().eq('provider','whop').eq('delivery_id',delivery).select('delivery_id')]){
        if(result.error)assert.equal(result.error.code,'42501');else assert.deepEqual(result.data,[]);
      }
    }
    const unchangedReceipt=await admin.from('webhook_deliveries').select('*').eq('provider','whop').eq('delivery_id',delivery).single();assert.equal(unchangedReceipt.error,null);assert.deepEqual(unchangedReceipt.data,receipt.data);
    for(const actor of actors){const initial=await request('/api/billing/status',actor.token);assert.equal(initial.status,200);assert.equal((await initial.json() as {plan:string}).plan,'free');}
    const start=new Date(),end=new Date(start.getTime()+30*86400000);
    const fixture=await admin.rpc('activate_xroga_paid_cycle',{p_user_id:owner.id,p_provider_reference:`synthetic-route-${randomUUID()}`,p_starts_at:start.toISOString(),p_ends_at:end.toISOString()});assert.equal(fixture.error,null);
    const member=`mem_route_${randomUUID()}`,manage='https://whop.com/orders/synthetic-owner-management';
    assert.equal((await admin.from('whop_memberships').insert({user_id:owner.id,whop_membership_id:member,whop_plan_id:'plan_hlV1A10I5QfSP',whop_account_id:'biz_qhYONL4RebGX96',status:'active',manage_url:manage})).error,null);
    const rows=async()=>{const result=await admin.from('xroga_billing_cycles').select('*').in('user_id',actors.map(a=>a.id)).order('id');assert.equal(result.error,null);return result.data!;};
    const before=await rows();
    for(const path of ['/status','/entitlement']){
      assert.equal((await request(`/api/billing${path}`)).status,401);
      const own=await request(`/api/billing${path}?userId=${other.id}&tenantId=${other.id}`,owner.token);assert.equal(own.status,200);
      const data=await own.json() as {plan?:string;state?:string};assert.equal(path==='/status'?data.plan:data.state,path==='/status'?'spark':'paid_active');
      const foreign=await request(`/api/billing${path}?userId=${owner.id}`,other.token);assert.equal(foreign.status,200);
      const hidden=await foreign.json() as {plan?:string;state?:string};assert.equal(path==='/status'?hidden.plan:hidden.state,path==='/status'?'free':'free_active');
    }
    const forged={userId:owner.id,tenantId:owner.id,tenantContext:{userId:owner.id},pacing:'full_access',confirmed:true};
    assert.equal((await request('/api/billing/pacing',undefined,'POST',forged)).status,401);
    assert.equal((await request('/api/billing/pacing',other.token,'POST',forged)).status,409);
    assert.equal((await request('/api/billing/pacing',owner.token,'POST',{...forged,confirmed:false})).status,409);
    assert.equal((await request('/api/billing/pacing',owner.token,'POST',{pacing:'invalid'})).status,400);
    assert.deepEqual(await rows(),before,'Forged actor, missing confirmation and malformed pacing cannot modify either cycle');
    const accepted=await request('/api/billing/pacing',owner.token,'POST',{...forged,userId:other.id,tenantId:other.id});assert.equal(accepted.status,200);assert.equal((await accepted.json() as {pacing:string}).pacing,'full_access');
    const after=await rows();assert.deepEqual(after.filter(row=>row.user_id===other.id),before.filter(row=>row.user_id===other.id));assert.equal(after.find(row=>row.user_id===owner.id&&row.status==='active')?.pacing,'full_access');
    assert.equal((await request('/api/billing/manage',undefined,'POST',{})).status,401);
    const ownPortal=await request('/api/billing/manage',owner.token,'POST',{userId:other.id});assert.equal(ownPortal.status,200);assert.deepEqual(await ownPortal.json(),{manageUrl:manage});
    const deniedPortal=await request('/api/billing/manage',other.token,'POST',{userId:owner.id,whop_membership_id:member});assert.equal(deniedPortal.status,409);assert.ok(!(await deniedPortal.text()).includes('synthetic-owner-management'));
  });
}
