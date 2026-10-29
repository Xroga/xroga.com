import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {browserModelFixture,browserOwner,browserProject} from '../workers/browserModelFixture.test.js';
import {withTenantModelReservation} from './tenantModelDispatch.js';
import {chatCompletion} from './openaiCompat.js';
import {executeWithProviderFallback,resetModelRuntimeHealth} from './providerRuntime.js';

test('real SDK redirects cannot become retries or another provider fallback',async t=>{
  const nativeFetch=globalThis.fetch;const fixture=browserModelFixture(t),controlledFetch=globalThis.fetch;
  fixture.reply=()=>({id:'synthetic-redirect-fixture',usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:'owned fixture'}}]});
  let initial=0,forwarded=0,fallback=0;resetModelRuntimeHealth();t.after(()=>resetModelRuntimeHealth());
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(200).end('{}');});
  const source=createServer((_req,res)=>{initial++;res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end();});
  await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const origin=new URL(String(input)).origin;
    if(origin==='https://openrouter.ai')return nativeFetch(`http://127.0.0.1:${(source.address() as AddressInfo).port}/`,init);
    if(origin==='https://open.bigmodel.cn')fallback++;
    return controlledFetch(input,init);
  });
  const messages=[{role:'user' as const,content:'owned fixture'}];
  try{
    await assert.rejects(executeWithProviderFallback({routes:['deepseek_v4_flash','glm_5_3_flash'],maximumAttemptsPerRoute:1,recordHealth:false,
      execute:modelId=>withTenantModelReservation({scope:{context:fixture.authority.context,userId:browserOwner,projectId:browserProject},modelId,payload:{messages},estimatedInputTokens:4,maximumOutputTokens:8,
        execute:d=>chatCompletion(modelId,d.payload.messages as typeof messages,{maxTokens:8,credentialOverride:d.credentialOverride,beforeDispatch:d.beforeDispatch})})}),{code:'MODEL_DESTINATION_DENIED'});
    assert.equal(initial,1);assert.equal(forwarded,0);assert.equal(fallback,0);
    assert.equal(fixture.ledger.released.at(-1)?.p_pending_reconciliation,true,'Already dispatched bytes retain their conservative hold until reconciliation');
  }finally{t.diagnostic(JSON.stringify({initial,forwarded,fallback}));source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);}
});
