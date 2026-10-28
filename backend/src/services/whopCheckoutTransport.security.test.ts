import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {readWhopCheckoutOwner} from './whopCheckoutOwnership.js';
const input={checkoutId:'ch_fixture',accountId:'biz_fixture',planId:'plan_fixture',apiKey:'synthetic-only',apiVersion:'2026-09-06'};
const owner='11111111-1111-4111-8111-111111111111';
const receipt={id:input.checkoutId,account_id:input.accountId,mode:'payment',plan:{id:input.planId},metadata:{source:'xroga',plan_tier:'spark',xroga_user_id:owner,xroga_checkout_id:'fixture_nonce'}};

test('Whop ownership readback rejects an oversized otherwise-valid owner receipt',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({...receipt,padding:'x'.repeat(65537)}));
  await assert.rejects(readWhopCheckoutOwner(input),{message:'checkout_owner_unavailable'});
});

test('Whop ownership lookup refuses real redirects without a second request',async t=>{
  const nativeFetch=globalThis.fetch;let forwarded=0;
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(receipt));});
  const source=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end());
  await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
  t.mock.method(globalThis,'fetch',async(url:Parameters<typeof fetch>[0],init?:RequestInit)=>{assert.equal(String(url),'https://api.whop.com/api/v1/checkout_configurations/ch_fixture');return nativeFetch(`http://127.0.0.1:${(source.address() as AddressInfo).port}/`,init);});
  try{await assert.rejects(readWhopCheckoutOwner(input),{message:'checkout_owner_unavailable'});assert.equal(forwarded,0);}
  finally{source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);}
});
