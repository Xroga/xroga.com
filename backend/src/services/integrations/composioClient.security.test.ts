import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyComposioToolRisk,getComposioToolDetails} from './composioClient.js';

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
    calls++;assert.equal(init?.redirect,'error');return Response.json({slug:'SLACK_GET_MESSAGE',toolkit:{slug:'slack'},tags:['readOnlyHint']});
  });
  try{assert.equal((await getComposioToolDetails('SLACK_GET_MESSAGE')).slug,'SLACK_GET_MESSAGE');assert.equal(calls,1);}
  finally{if(old===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=old;}
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
