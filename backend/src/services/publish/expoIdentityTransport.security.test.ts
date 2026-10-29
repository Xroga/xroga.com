import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {verifyExpoToken} from './userOwnedPublish.js';

test('Expo credential identity probe cannot follow a real redirected endpoint',async t=>{
  const nativeFetch=globalThis.fetch;let forwarded=0;
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(200,{'content-type':'application/json'}).end('{"username":"redirected-user"}');});
  const source=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end());
  await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{assert.equal(input,'https://exp.host/--/api/v2/auth/userInfo');return nativeFetch(`http://127.0.0.1:${(source.address() as AddressInfo).port}/`,init);});
  try{const result=await verifyExpoToken('synthetic-expo-token');assert.equal(result.ok,false);assert.equal(forwarded,0);}
  finally{source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);}
});

test('Expo identity probes bound inputs and actual receipts while valid account identities still work',async t=>{
  let calls=0,cancelled=0;
  t.mock.method(globalThis,'fetch',async(_input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    calls++;assert.equal(init?.redirect,'manual');assert.ok(init?.signal instanceof AbortSignal);return Response.json({data:{user:{username:'authorized_fixture'}}});
  });
  assert.equal((await verifyExpoToken('x'.repeat(4097))).ok,false);assert.equal((await verifyExpoToken('contains\ncontrol')).ok,false);assert.equal(calls,0);
  assert.deepEqual(await verifyExpoToken('synthetic-expo-token'),{ok:true,username:'authorized_fixture'});assert.equal(calls,1);
  t.mock.restoreAll();t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(controller){controller.enqueue(Buffer.alloc(65537));},cancel(){cancelled++;}})));
  assert.equal((await verifyExpoToken('synthetic-expo-token')).ok,false);assert.equal(cancelled,1);
});

test('Expo identity failures cannot return echoed credentials and empty receipts cannot authorize a connection',async t=>{
  const token='SYNTHETIC_EXPO_CREDENTIAL_CANARY';
  t.mock.method(globalThis,'fetch',async()=>new Response(token,{status:500}));
  const denied=await verifyExpoToken(token);assert.equal(denied.ok,false);assert.ok(!JSON.stringify(denied).includes(token));
  t.mock.restoreAll();t.mock.method(globalThis,'fetch',async()=>Response.json({}));
  assert.equal((await verifyExpoToken(token)).ok,false);
});
