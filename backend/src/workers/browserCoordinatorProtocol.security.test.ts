import test from 'node:test';
import assert from 'node:assert/strict';
import {RemoteBrowserWorker} from './browserCoordinator.js';
import {parseBrowserJob} from './browserJob.js';
const job=parseBrowserJob({version:1,tenantId:'t1',userId:'u1',projectId:'p1',runId:'r1',taskId:'k1',attempt:1,
  allowedOrigins:['https://example.com'],startUrl:'https://example.com/',limits:{maxDurationMs:60000,maxNavigations:5,maxRedirects:1,maxPages:1,maxResponseBytes:1000000,maxArtifactBytes:1000000,maxModelCostMicros:0}});
const lease={tenantId:'t1',runId:'r1',taskId:'k1',workerId:'api-1',token:7,expiresAt:Date.now()+60000};
const id='11111111-1111-4111-8111-111111111111';
const result={finalUrl:'https://example.com/',visitedUrls:[],navigations:0,responseBytes:0,summary:'ok',artifacts:[]};
function worker(fetchImpl:typeof fetch){return new RemoteBrowserWorker({baseUrl:'http://127.0.0.1',secret:'s'.repeat(40),fetchImpl});}

test('untrusted coordinator job IDs cannot select signed follow-up paths',async()=>{
  const paths:string[]=[];
  const remote=worker(async(input)=>{paths.push(String(input));return new Response(JSON.stringify({type:'result',result})+'\n',{headers:{'x-xroga-job':'../other-job'}});});
  await assert.rejects(remote.run(job,{signal:new AbortController().signal,lease}),e=>(e as any).code==='WORKER_FAILED'&&(e as any).retryable===false);
  assert.deepEqual(paths,['http://127.0.0.1/v1/jobs']);
});
test('oversized coordinator records are cancelled and cannot become retryable failures',async()=>{
  let cancelled=false,timer:ReturnType<typeof setTimeout>;
  const remote=worker(async(_input,init)=>init?.method==='DELETE'?new Response(null,{status:204}):new Response(new ReadableStream({
    start(c){c.enqueue(new TextEncoder().encode('x'.repeat(6*1024*1024)));timer=setTimeout(()=>c.close(),25);},cancel(){cancelled=true;clearTimeout(timer);}
  }),{headers:{'x-xroga-job':id}}));
  await assert.rejects(remote.run(job,{signal:new AbortController().signal,lease}),e=>(e as any).code==='RESULT_OVER_LIMIT'&&(e as any).retryable===false);
  assert.equal(cancelled,true,'The pending untrusted stream is cancelled on refusal');
});
test('held platform credentials cannot ride in a browser plan to the worker',async()=>{
  const old=process.env.COMPOSIO_API_KEY,secret='synthetic-held-key-47c290e1fca94383b7829427';process.env.COMPOSIO_API_KEY=secret;let calls=0;
  try{
    const remote=worker(async()=>{calls++;return new Response(JSON.stringify({type:'result',result})+'\n',{headers:{'x-xroga-job':id}});});
    await assert.rejects(remote.run(job,{signal:new AbortController().signal,lease,plan:{steps:[{op:'fill',selector:'#field',value:secret}],expect:[]}}),e=>(e as any).code==='CREDENTIAL_LIKE_CONTENT');
    assert.equal(calls,0,'Credential denial precedes the signed dispatch');
  }finally{if(old===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=old;}
});
test('malformed coordinator records are terminal protocol denials',async()=>{
  const remote=worker(async(_input,init)=>init?.method==='DELETE'?new Response(null,{status:204}):new Response('not-json\n',{headers:{'x-xroga-job':id}}));
  await assert.rejects(remote.run(job,{signal:new AbortController().signal,lease}),e=>(e as any).code==='WORKER_FAILED'&&(e as any).retryable===false);
});
test('coordinator redirect rejection stays terminal through signed transport',async()=>{
  let calls=0;
  const remote=worker(async()=>{calls++;return new Response(null,{status:307,headers:{location:'https://outside.test/'}});});
  await assert.rejects(remote.run(job,{signal:new AbortController().signal,lease}),e=>(e as any).code==='WORKER_FAILED'&&(e as any).retryable===false);
  assert.equal(calls,1);
});
test('coordinator authentication refusal cannot trigger another attempt',async()=>{
  let calls=0;const remote=worker(async()=>{calls++;return new Response('synthetic denied',{status:403});});
  await assert.rejects(remote.run(job,{signal:new AbortController().signal,lease}),e=>(e as any).retryable===false);
  assert.equal(calls,1);
});
test('configured coordinator origins cannot carry userinfo, paths, query strings or fragments',()=>{
  for(const baseUrl of ['https://user:secret@host.test','https://host.test/other','https://host.test/?x=y','https://host.test/#other'])assert.throws(()=>new RemoteBrowserWorker({baseUrl,secret:'s'.repeat(40)}));
});
test('a cancelled coordinator cannot publish a late successful result',async()=>{
  const abort=new AbortController();
  const remote=worker(async(_input,init)=>{if(init?.method==='DELETE')return new Response(null,{status:204});abort.abort();return new Response(JSON.stringify({type:'result',result})+'\n',{headers:{'x-xroga-job':id}});});
  await assert.rejects(remote.run(job,{signal:abort.signal,lease}),e=>(e as any).code==='CANCELLED');
});
