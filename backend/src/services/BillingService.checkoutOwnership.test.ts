import {executeCheckoutWithFixtureClaim} from './fixtures/checkoutApproval.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BillingService,resetBillingMemoryForTests} from './BillingService.js';

for(const kind of ['payment.succeeded','membership.activated'] as const)test(`billing ${kind} cannot bind a server-issued checkout to the different user claimed by callback metadata`,async t=>{
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','WHOP_API_KEY','WHOP_COMPANY_ID','WHOP_PLAN_ID','WHOP_REDIRECT_URL'];
  const prior=names.map(key=>process.env[key]);t.after(()=>{names.forEach((key,i)=>prior[i]===undefined?delete process.env[key]:process.env[key]=prior[i]);resetBillingMemoryForTests();});
  Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:49197',SUPABASE_SERVICE_ROLE_KEY:'synthetic',WHOP_API_KEY:'synthetic',WHOP_COMPANY_ID:'biz_qhYONL4RebGX96',WHOP_PLAN_ID:'plan_hlV1A10I5QfSP',WHOP_REDIRECT_URL:'https://xroga.com/workspace?billing=success'});
  resetBillingMemoryForTests();
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',checkout='ch_owned_fixture';
  const plan={id:'plan_hlV1A10I5QfSP',account_id:'biz_qhYONL4RebGX96',plan_type:'renewal',renewal_price:25,billing_period:30,trial_period_days:null,currency:'usd'};
  let metadata:Record<string,unknown>={},writes=0;
  const configuration=()=>({id:checkout,account_id:plan.account_id,plan,mode:'payment',metadata,purchase_url:'https://whop.com/checkout/plan_hlV1A10I5QfSP/?fixture=owned'});
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.origin==='https://api.whop.com'){
      if(url.pathname===`/api/v1/plans/${plan.id}`)return Response.json(plan);
      if(url.pathname==='/api/v1/checkout_configurations'&&init?.method==='POST'){
        metadata=JSON.parse(String(init.body)).metadata;assert.equal(metadata.xroga_user_id,owner);return Response.json(configuration());
      }
      if(url.pathname===`/api/v1/checkout_configurations/${checkout}`)return Response.json(configuration());
      throw new Error('No other vendor call is permitted');
    }
    assert.equal(url.origin,'http://127.0.0.1:49197');
    if(url.pathname.endsWith('/whop_payment_fulfillments'))return Response.json(null);
    if(url.pathname.endsWith('/profiles'))return Response.json({id:other});
    if(url.pathname.endsWith('/fulfill_whop_payment')){writes++;return Response.json(true);}
    if(url.pathname.endsWith('/whop_memberships')){
      if(init?.method==='POST'||init?.method==='PATCH'){writes++;return Response.json(init.method==='PATCH'?{whop_membership_id:'mem_fixture'}:null);}
      return Response.json(null);
    }
    throw new Error('Unexpected persistence path');
  });
  const issued=await executeCheckoutWithFixtureClaim(owner);assert.equal(issued.checkoutConfigurationId,checkout);
  const event={type:kind,account_id:plan.account_id,data:{id:kind==='payment.succeeded'?'pay_fixture':'mem_fixture',status:kind==='payment.succeeded'?'succeeded':'active',plan_id:plan.id,account_id:plan.account_id,checkout_configuration_id:checkout,metadata:{...metadata,xroga_user_id:other}}};
  await assert.rejects(BillingService.handleWebhookEvent(event,'synthetic_delivery'),/owner_mismatch/);
  assert.equal(writes,0,'Callback metadata cannot select another app user for an issued checkout');
});

test('billing first claims, stored parents, replay and unavailable owner evidence stay fail closed',async t=>{
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','WHOP_API_KEY','WHOP_COMPANY_ID','WHOP_PLAN_ID','WHOP_REDIRECT_URL'];
  const prior=names.map(key=>process.env[key]);t.after(()=>{names.forEach((key,i)=>prior[i]===undefined?delete process.env[key]:process.env[key]=prior[i]);resetBillingMemoryForTests();});
  Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:49197',SUPABASE_SERVICE_ROLE_KEY:'synthetic',WHOP_API_KEY:'synthetic',WHOP_COMPANY_ID:'biz_qhYONL4RebGX96',WHOP_PLAN_ID:'plan_hlV1A10I5QfSP',WHOP_REDIRECT_URL:'https://xroga.com/workspace?billing=success'});
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  const account='biz_qhYONL4RebGX96',plan='plan_hlV1A10I5QfSP',checkout='ch_bound_fixture';
  const metadata={xroga_user_id:owner,source:'xroga',plan_tier:'spark',xroga_checkout_id:'fixture_nonce'};
  let stored:Record<string,unknown>|null=null,receipt:Record<string,unknown>|null=null,providerOwner=owner,providerMode='ok',dbMode='ok';
  let writes:Record<string,unknown>[]=[],providerReads=0,rpcResult:unknown=true;
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input)),method=init?.method??'GET';
    if(url.origin==='https://api.whop.com'){
      assert.equal(url.pathname,`/api/v1/checkout_configurations/${checkout}`);providerReads++;
      if(providerMode==='outage')return Response.json({error:'synthetic'},{status:503});
      return Response.json({id:checkout,account_id:providerMode==='foreign_account'?'biz_other':account,plan:{id:plan},mode:'payment',metadata:providerMode==='missing_metadata'?null:{...metadata,xroga_user_id:providerOwner}});
    }
    assert.equal(url.origin,'http://127.0.0.1:49197');
    if(dbMode==='outage')return Response.json({message:'synthetic'},{status:503});
    if(url.pathname.endsWith('/whop_payment_fulfillments'))return Response.json(receipt);
    if(url.pathname.endsWith('/profiles'))return Response.json({id:owner});
    if(url.pathname.endsWith('/fulfill_whop_payment')){writes.push(JSON.parse(String(init?.body)));return Response.json(rpcResult);}
    assert.ok(url.pathname.endsWith('/whop_memberships'));
    if(method==='GET')return Response.json(stored);
    const row=JSON.parse(String(init?.body));writes.push(row);
    if(method==='PATCH'){
      assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
      assert.equal(url.searchParams.get('whop_membership_id'),'eq.mem_bound_fixture');
    }
    return Response.json(method==='PATCH'?{whop_membership_id:'mem_bound_fixture'}:null);
  });
  const event=(kind:'payment.succeeded'|'membership.activated',withCheckout=true)=>({type:kind,account_id:account,data:{id:kind==='payment.succeeded'?'pay_bound_fixture':'mem_bound_fixture',status:kind==='payment.succeeded'?'succeeded':'active',plan_id:plan,...(withCheckout?{checkout_configuration_id:checkout}:{}),metadata:{...metadata}}});
  for(const kind of ['payment.succeeded','membership.activated'] as const){
    writes=[];providerReads=0;
    assert.deepEqual(await BillingService.handleWebhookEvent(event(kind),'fixture'),{fulfilled:kind==='payment.succeeded'});
    assert.equal(providerReads,1);assert.equal(writes.length,kind==='payment.succeeded'?1:2);
    for(const row of writes){assert.equal(row.user_id??row.p_user_id,owner);assert.equal(row.whop_checkout_configuration_id??row.p_checkout_configuration_id,checkout);}
    for(providerMode of ['outage','foreign_account','missing_metadata']){
      writes=[];await assert.rejects(BillingService.handleWebhookEvent(event(kind),'fixture'),/checkout_owner_unavailable/);assert.equal(writes.length,0);
    }
    providerMode='ok';writes=[];providerReads=0;
    await assert.rejects(BillingService.handleWebhookEvent(event(kind,false),'fixture'),/checkout_owner_unavailable/);assert.equal(writes.length,0);assert.equal(providerReads,0);
    dbMode='outage';await assert.rejects(BillingService.handleWebhookEvent(event(kind),'fixture'),/failed/);assert.equal(writes.length,0);assert.equal(providerReads,0);dbMode='ok';
  }
  stored={user_id:owner,whop_membership_id:'mem_bound_fixture',whop_plan_id:plan,whop_account_id:account,whop_checkout_configuration_id:'ch_existing_fixture'};
  providerMode='outage';writes=[];providerReads=0;
  await BillingService.handleWebhookEvent(event('membership.activated',false),'fixture');
  assert.equal(providerReads,0);assert.ok(writes.every(row=>row.whop_checkout_configuration_id==='ch_existing_fixture'),'Partial legacy callbacks retain the known checkout parent');
  providerMode='ok';providerOwner=other;writes=[];
  await assert.rejects(BillingService.handleWebhookEvent(event('membership.activated'),'fixture'),/owner_mismatch/);assert.equal(writes.length,0,'A replacement checkout needs the same canonical owner');
  stored=null;providerOwner=owner;receipt={user_id:owner,whop_payment_id:'pay_bound_fixture'};rpcResult=false;writes=[];providerReads=0;providerMode='outage';
  assert.deepEqual(await BillingService.handleWebhookEvent(event('payment.succeeded',false),'fixture'),{fulfilled:false});assert.equal(providerReads,0,'Durable legacy replay does not require provider metadata access');
  receipt={user_id:other,whop_payment_id:'pay_bound_fixture'};writes=[];
  await assert.rejects(BillingService.handleWebhookEvent(event('payment.succeeded'),'fixture'),/owner_mismatch/);assert.equal(writes.length,0);
  receipt={user_id:owner,whop_payment_id:'pay_bound_fixture'};rpcResult={fulfilled:true};
  await assert.rejects(BillingService.handleWebhookEvent(event('payment.succeeded'),'fixture'),/payment_fulfillment_failed/);
});
