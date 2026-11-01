import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyComposioToolRisk,getComposioToolDetails} from './composioClient.js';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {isTerminalModelFailure} from '../../ai/providerRuntime.js';

test('external read-only metadata cannot downgrade server-side destructive, write or unknown tool risk',()=>{
  for(const tags of [[],['readOnlyHint'],['readOnlyHint','approved','safe']]){
    assert.equal(classifyComposioToolRisk('SLACK_DELETE_MESSAGE',tags),'destructive');
    assert.equal(classifyComposioToolRisk('GMAIL_SEND_EMAIL',tags),'write');
    assert.equal(classifyComposioToolRisk('OPAQUE_PROVIDER_OPERATION',tags),'unknown');
  }
  assert.equal(classifyComposioToolRisk('SLACK_GET_MESSAGE'),'read');
  assert.equal(classifyComposioToolRisk('SLACK_GET_AND_DELETE_MESSAGE',['readOnlyHint']),'destructive');
  assert.equal(classifyComposioToolRisk('SLACK_GET_MESSAGE',['destructiveHint']),'destructive');
});

test('fixed Composio transport refuses credential-bearing redirects before following them',async t=>{
  const old=process.env.COMPOSIO_API_KEY;process.env.COMPOSIO_API_KEY='synthetic-platform-key';
  let calls=0;
  t.mock.method(globalThis,'fetch',async(_input:unknown,init?:RequestInit)=>{
    calls++;assert.equal(init?.redirect,'manual');return Response.json({slug:'SLACK_GET_MESSAGE',toolkit:{slug:'slack'},tags:['readOnlyHint']});
  });
  try{assert.equal((await getComposioToolDetails('SLACK_GET_MESSAGE')).slug,'SLACK_GET_MESSAGE');assert.equal(calls,1);}
  finally{if(old===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=old;}
});

test('real Composio redirects stay security denials rather than ordinary network errors',async t=>{
  const old=process.env.COMPOSIO_API_KEY;process.env.COMPOSIO_API_KEY='synthetic-platform-key';
  const nativeFetch=globalThis.fetch;let forwarded=0;
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(200).end('{}');});
  const source=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end());
  await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
  t.mock.method(globalThis,'fetch',async(_input:Parameters<typeof fetch>[0],init?:RequestInit)=>nativeFetch(`http://127.0.0.1:${(source.address() as AddressInfo).port}/`,init));
  try{
    await assert.rejects(getComposioToolDetails('SLACK_GET_REDIRECT_FIXTURE'),error=>{assert.equal(isTerminalModelFailure(error),true);assert.equal((error as {reason?:string}).reason,'UNSAFE_DESTINATION');return true;});
    assert.equal(forwarded,0);
  }finally{
    if(old===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=old;
    source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);
  }
});

test('Composio response byte ceiling stops and cancels a dishonest unbounded stream',async t=>{
  const old=process.env.COMPOSIO_API_KEY;process.env.COMPOSIO_API_KEY='synthetic-platform-key';let pulls=0,cancelled=false;
  t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream<Uint8Array>({
    pull(controller){pulls++;if(pulls>20)controller.close();else controller.enqueue(new Uint8Array(1024*1024));},
    cancel(){cancelled=true;},
  }),{headers:{'Content-Length':'1'}}));
  try{
    await assert.rejects(getComposioToolDetails('SLACK_GET_MESSAGE'),{code:'COMPOSIO_RESPONSE_TOO_LARGE'});
    assert.ok(pulls<=9,`bounded reads required, got ${pulls} chunks`);assert.equal(cancelled,true);
  }finally{if(old===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=old;}
});
