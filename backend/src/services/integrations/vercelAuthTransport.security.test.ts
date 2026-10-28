import test from 'node:test';
import assert from 'node:assert/strict';
import { probeVercelApiCapabilities } from './vercelAuth.js';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

test('Vercel credential capability probes treat redirects as terminal security denials',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:307,headers:{location:'https://untrusted.example/collect'}}));
  await assert.rejects(probeVercelApiCapabilities('synthetic-owner-token'),{code:'VERCEL_AUTH_TRANSPORT_DENIED'});
});

test('real HTTP redirects remain terminal instead of becoming ordinary provider unavailability',async t=>{
  const originalFetch=globalThis.fetch;let forwarded=0;
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(200).end('{}');});
  const source=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end());
  await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
  t.mock.method(globalThis,'fetch',async(_input:Parameters<typeof fetch>[0],init?:RequestInit)=>
    originalFetch(`http://127.0.0.1:${(source.address() as AddressInfo).port}/`,init));
  try{await assert.rejects(probeVercelApiCapabilities('synthetic-only-token'),{code:'VERCEL_AUTH_TRANSPORT_DENIED'});assert.equal(forwarded,0);}
  finally{source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);}
});

test('Vercel capability probes bound actual response bytes and cancel excessive streams',async t=>{
  let cancelled=0;
  t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(controller){controller.enqueue(Buffer.alloc(2*1024*1024+1));},cancel(){cancelled++;}})));
  await assert.rejects(probeVercelApiCapabilities('synthetic-owner-token'),{code:'VERCEL_AUTH_TRANSPORT_DENIED'});
  assert.equal(cancelled,2);
});

test('ordinary authorized Vercel probes keep capability semantics and use fixed bounded nonredirecting requests',async t=>{
  const seen:Array<{url:string;init?:RequestInit}>=[];
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    seen.push({url:String(input),init});return Response.json({}, {status:String(input).includes('/v9/projects')?200:403});
  });
  assert.deepEqual(await probeVercelApiCapabilities('synthetic-owner-token'),{canListProjects:true,canReadDeployments:false});
  assert.equal(seen.length,2);
  for(const request of seen){assert.equal(new URL(request.url).origin,'https://api.vercel.com');assert.equal(request.init?.redirect,'manual');assert.ok(request.init?.signal instanceof AbortSignal);}
});
