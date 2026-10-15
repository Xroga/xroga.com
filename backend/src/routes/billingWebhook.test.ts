import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import router from './billingWebhook.js';
import { BillingService } from '../services/BillingService.js';

test('signed webhook retry requires an acquired row and never persists raw failure details',async(t)=>{
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','WHOP_WEBHOOK_SECRET'] as const;
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',WHOP_WEBHOOK_SECRET:'synthetic-fixture-signing-key'});
  const originalFetch=globalThis.fetch;
  let mode='lost',calls=0;
  const writes:Record<string,unknown>[]=[];
  const raw=JSON.stringify({type:'membership.activated',account_id:'biz_qhYONL4RebGX96',data:{id:'mem_fixture'}});
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.origin,'http://127.0.0.1:1');assert.equal(url.pathname,'/rest/v1/webhook_deliveries');
    const method=init?.method??'GET';
    if(method==='POST')return Response.json({code:'23505',message:'fixture duplicate'},{status:409});
    if(method==='GET') {
      if(mode==='read-error')return Response.json({message:'PRIVATE_RAW_CREDENTIAL_CANARY'},{status:503});
      return Response.json({status:mode==='processing'?'processing':mode==='completed'?'completed':'failed',payload_digest:createHash('sha256').update(raw).digest('hex')});
    }
    assert.equal(method,'PATCH');assert.equal(url.searchParams.get('provider'),'eq.whop');assert.equal(url.searchParams.get('delivery_id'),'eq.msg_fixture');
    const body=JSON.parse(String(init?.body)) as Record<string,unknown>;writes.push(body);
    assert.equal(url.searchParams.get('payload_digest'),`eq.${createHash('sha256').update(raw).digest('hex')}`);
    if(body.status==='processing'){
      assert.equal(url.searchParams.get('status'),'eq.failed');assert.equal(url.searchParams.get('select'),'delivery_id');
      return Response.json(mode==='lost'?[]:[{delivery_id:'msg_fixture'}]);
    }
    assert.equal(url.searchParams.get('status'),'eq.processing');
    if(body.status==='completed') {
      assert.equal(url.searchParams.get('select'),'delivery_id');
      if(mode==='completion-transport')throw new Error('PRIVATE_RAW_CREDENTIAL_CANARY');
      if(mode==='completion-error')return Response.json({message:'PRIVATE_RAW_CREDENTIAL_CANARY'},{status:503});
      return Response.json(mode==='completion-empty'?[]:mode==='completion-foreign'?[{delivery_id:'another_delivery'}]:[{delivery_id:'msg_fixture'}]);
    }
    return new Response(null,{status:204});
  };
  t.mock.method(BillingService,'handleWebhookEvent',async()=>{calls++;if(mode==='failure')throw new Error('PRIVATE_RAW_CREDENTIAL_CANARY');return {fulfilled:false};});
  const logged:unknown[][]=[];t.mock.method(console,'error',(...args:unknown[])=>logged.push(args));t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
  const app=express();app.use(router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{globalThis.fetch=originalFetch;server.close();await once(server,'close');for(const name of names)saved[name]===undefined?delete process.env[name]:process.env[name]=saved[name];});
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const send=async(valid=true)=>{
    const timestamp=String(Math.floor(Date.now()/1000));
    const signature=createHmac('sha256',process.env.WHOP_WEBHOOK_SECRET!).update(`msg_fixture.${timestamp}.${raw}`).digest('base64');
    return originalFetch(`http://127.0.0.1:${address.port}/whop`,{method:'POST',headers:{'Content-Type':'application/json','webhook-id':'msg_fixture','webhook-timestamp':timestamp,'webhook-signature':valid?`v1,${signature}`:'v1,invalid'},body:raw});
  };
  assert.equal((await send(false)).status,401);assert.equal(writes.length,0);assert.equal(calls,0);
  const lost=await send();assert.equal(lost.status,503);assert.equal(calls,0);
  for(mode of ['processing','read-error']) { assert.equal((await send()).status,503);assert.equal(calls,0); }
  mode='completed';const duplicate=await send();assert.equal(duplicate.status,200);assert.deepEqual(await duplicate.json(),{received:true,duplicate:true});assert.equal(calls,0);
  mode='won';assert.equal((await send()).status,200);assert.equal(calls,1);assert.equal(writes.at(-1)?.status,'completed');
  mode='failure';const failed=await send();assert.equal(failed.status,500);assert.deepEqual(await failed.json(),{error:'Webhook processing failed'});
  assert.equal(writes.at(-1)?.safe_error,'processing_failed');
  for(mode of ['completion-error','completion-empty','completion-foreign','completion-transport']) {
    writes.length=0;
    const uncertain=await send();assert.equal(uncertain.status,503);
    assert.deepEqual(await uncertain.json(),{error:'Webhook completion could not be confirmed'});
    assert.deepEqual(writes.map(write=>write.status),['processing','completed']);
  }
  assert.ok(!JSON.stringify({writes,logged}).includes('PRIVATE_RAW_CREDENTIAL_CANARY'));
});
