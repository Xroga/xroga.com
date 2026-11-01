import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readWhopCheckoutOwner} from './whopCheckoutOwnership.js';

test('new checkout readback cannot substitute an older checkout for the same owner',async t=>{
 const input={checkoutId:'ch_fixture',accountId:'biz_fixture',planId:'plan_fixture',apiKey:'synthetic',apiVersion:'2026-09-06',expectedCheckoutNonce:'exact-new-approval'};
 t.mock.method(globalThis,'fetch',async()=>Response.json({id:input.checkoutId,account_id:input.accountId,mode:'payment',plan:{id:input.planId},metadata:{source:'xroga',plan_tier:'spark',xroga_user_id:'11111111-1111-4111-8111-111111111111',xroga_checkout_id:'old-approval'}}));
 await assert.rejects(readWhopCheckoutOwner(input),{message:'checkout_owner_unavailable'});
});

test('Whop checkout owner readback binds exact resource account plan and canonical server metadata',async t=>{
  const input={checkoutId:'ch_fixture',accountId:'biz_fixture',planId:'plan_fixture',apiKey:'synthetic',apiVersion:'2026-09-06'};
  const owner='11111111-1111-4111-8111-111111111111';
  const valid={id:input.checkoutId,account_id:input.accountId,mode:'payment',plan:{id:input.planId},metadata:{source:'xroga',plan_tier:'spark',xroga_user_id:owner,xroga_checkout_id:'fixture_nonce'}};
  let response:unknown=valid,mode='ok',calls=0;
  t.mock.method(globalThis,'fetch',async(url:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    calls++;assert.equal(String(url),'https://api.whop.com/api/v1/checkout_configurations/ch_fixture');
    assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.ok(init?.signal);const headers=new Headers(init?.headers);
    assert.equal(headers.get('Authorization'),'Bearer synthetic');assert.equal(headers.get('Api-Version-Date'),input.apiVersion);
    if(mode==='transport')throw new Error('PRIVATE_PROVIDER_CANARY');
    if(mode==='malformed')return new Response('not json');
    return Response.json(response,{status:mode==='outage'?503:200});
  });
  assert.deepEqual(await readWhopCheckoutOwner(input),{userId:owner,checkoutId:input.checkoutId,accountId:input.accountId,planId:input.planId});
  for(response of [null,[],{...valid,id:'ch_other'},{...valid,account_id:'biz_other'},{...valid,company_id:'biz_other'},
    {...valid,plan:{id:'plan_other'}},{...valid,mode:'setup'},{...valid,metadata:null},
    ...[{source:'foreign'},{plan_tier:'foreign'},{xroga_user_id:'invalid'},{xroga_checkout_id:''}].map(patch=>({...valid,metadata:{...valid.metadata,...patch}}))]){
    await assert.rejects(readWhopCheckoutOwner(input),{message:'checkout_owner_unavailable'});
  }
  response=valid;
  for(mode of ['transport','malformed','outage'])await assert.rejects(readWhopCheckoutOwner(input),{message:'checkout_owner_unavailable'});
  const before=calls;
  for(const checkoutId of ['https://other.invalid/ch_fixture','ch_../../other','ch_fixture?owner=other',''])await assert.rejects(readWhopCheckoutOwner({...input,checkoutId}),{message:'checkout_owner_unavailable'});
  assert.equal(calls,before,'Invalid target cannot choose a provider host or path');
});
