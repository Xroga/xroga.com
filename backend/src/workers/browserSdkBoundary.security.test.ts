import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserModelGateway } from './browserModelGateway.js';
import { planBrowserTask } from './browserPlanner.js';
import { parseBrowserJob } from './browserJob.js';
import { browserModelFixture, ownedBrowserJob } from './browserModelFixture.test.js';
import { createTenantContext } from '../security/tenantContext.js';

test('both actual browser SDK boundaries deny raw job IDs before reserving or constructing a provider client',async()=>{
  const job=parseBrowserJob({version:1,tenantId:'t1',userId:'u1',projectId:'p1',runId:'r1',taskId:'k1',attempt:1,
    startUrl:'https://example.com/',allowedOrigins:['https://example.com'],limits:{maxDurationMs:60000,maxNavigations:5,maxRedirects:1,maxPages:1,maxResponseBytes:1000000,maxArtifactBytes:1000000,maxModelCostMicros:2000000}});
  let reservations=0,clients=0;
  const deps={modelId:'deepseek_v4_flash' as const,reserve:async()=>{reservations++;return{id:'synthetic',reservedMicroUsd:2000000,priceVersion:'synthetic'};},
    settle:async()=>{},release:async()=>{},client:()=>{clients++;return{model:'synthetic',create:async()=>({id:'fixture',usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:'{"steps":[{"op":"screenshot","name":"page.png"}],"expect":[{"kind":"artifact","name":"page.png"}]}'}}]})};}};
  for(const invoke of [()=>createBrowserModelGateway(deps).generate({messages:[{role:'user',content:{type:'text',text:'synthetic'}}]},
    {job,remainingMicros:2000000,signal:new AbortController().signal}),()=>planBrowserTask('synthetic',job,deps)]){
    await assert.rejects(invoke(),{code:'TENANT_AUTH_REQUIRED'});
    assert.equal(reservations,0);assert.equal(clients,0);
  }
});

for(const boundary of ['gateway','planner'] as const){
  test(`${boundary}: actual SDK checks actor, current ownership, secret egress, reservation, cancellation and settlement`,async t=>{
    const fixture=browserModelFixture(t),job=ownedBrowserJob(),abort=new AbortController();
    const params={messages:[{role:'user',content:{type:'text',text:'owned fixture'}}]};
    const plan={steps:[{op:'screenshot',name:'page.png'}],expect:[{kind:'artifact',name:'page.png'}]};
    const success=()=>({id:'fixture-browser-completion',usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:JSON.stringify(plan)}}]});
    fixture.reply=success;
    const call=(authority=fixture.authority,selectedJob=job,signal=abort.signal)=>boundary==='gateway'
      ?createBrowserModelGateway({modelId:'deepseek_v4_flash'}).generate(params,{job:selectedJob,remainingMicros:2000000,signal,authority})
      :planBrowserTask(params.messages[0].content.text,selectedJob,{modelId:'deepseek_v4_flash'},{authority,signal});
    await call();assert.equal(fixture.bodies.length,1);assert.equal(fixture.ledger.atomic,1);
    const noDispatch=async(invoke:()=>Promise<unknown>)=>{const before=fixture.bodies.length;await assert.rejects(invoke());assert.equal(fixture.bodies.length,before);};
    await noDispatch(()=>call({...fixture.authority,context:{...fixture.authority.context}}));
    await noDispatch(()=>call({...fixture.authority,context:createTenantContext({userId:'22222222-2222-4222-8222-222222222222',via:'remote_getuser'})}));
    await noDispatch(()=>call(fixture.authority,{...job,tenantId:'foreign'}));
    fixture.owner='22222222-2222-4222-8222-222222222222';await noDispatch(()=>call());fixture.owner=job.userId;
    fixture.beforeReserve=()=>{fixture.owner='22222222-2222-4222-8222-222222222222';};await noDispatch(()=>call());fixture.owner=job.userId;fixture.beforeReserve=()=>{};
    fixture.mode='reservationDenied';await noDispatch(()=>call());fixture.mode='ok';
    params.messages[0].content.text=process.env.OPENROUTER_API_KEY!;await noDispatch(()=>call());params.messages[0].content.text='owned fixture';
    const stopped=new AbortController();stopped.abort();await noDispatch(()=>call(fixture.authority,job,stopped.signal));
    const duringReserve=new AbortController();fixture.beforeReserve=()=>duringReserve.abort();await noDispatch(()=>call(fixture.authority,job,duringReserve.signal));fixture.beforeReserve=()=>{};
    const before=fixture.bodies.length;fixture.mode='settlementDenied';
    await assert.rejects(call(),{code:'POST_COMPLETION_ACCOUNTING_UNCERTAIN'});assert.equal(fixture.bodies.length,before+1);fixture.mode='ok';
    const held=fixture.ledger.released.at(-1);assert.equal(held.p_pending_reconciliation,true);
    fixture.beforeSettle=()=>{fixture.owner='22222222-2222-4222-8222-222222222222';};
    await assert.rejects(call());fixture.beforeSettle=()=>{};fixture.owner=job.userId;
    fixture.reply=()=>({...success(),id:process.env.OPENROUTER_API_KEY!});
    await assert.rejects(call(),{code:'POST_COMPLETION_ACCOUNTING_UNCERTAIN'});fixture.reply=success;
    fixture.reply=()=>Response.json({error:{message:'synthetic unavailable'}},{status:503});
    await assert.rejects(call(),(error:any)=>error.status===503);
    fixture.reply=success;await call();
    assert.equal(fixture.bodies.at(-1).model,'deepseek/deepseek-v4-flash','Authorized provider recovery retains the configured model');
  });
}
