import assert from 'node:assert/strict';
import test from 'node:test';
import dns from 'node:dns/promises';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import { parallelSearch,parallelExtract,parallelResponses } from './parallelWeb.js';
import {createTenantContext,type TenantContext} from '../security/tenantContext.js';
import {isTerminalModelFailure} from './providerRuntime.js';
import {WEB_PRICE_VERSION} from './webBudget.js';
import {randomUUID} from 'node:crypto';
import {executeParallelRequest} from './parallelDispatch.js';
import {actionPlanDigest} from '../services/integrations/businessAction.js';
import {nativeReleaseFixture} from '../services/publish/__tests__/nativeReleaseFixture.js';
import {confirmBusinessAction} from '../services/integrations/businessActionConfirmations.js';
import {resetCredentialVaultRuntimeForTests} from '../services/integrations/credentialVaultRuntime.js';
import {withRunAttempt,createRunDurable,captureAdmittedRunAttempt} from './runStore.js';

function publicPdfFixture(){
 const content='BT /F1 12 Tf 50 200 Td (Public PDF fixture) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let value='%PDF-1.4\n';const offsets=[0];for(const[index,body]of objects.entries()){offsets.push(Buffer.byteLength(value));value+=`${index+1} 0 obj\n${body}\nendobj\n`;}const xref=Buffer.byteLength(value);value+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(value);
}

test('each Parallel provider entry denies raw user ID authorization before network dispatch',async t=>{
  const prior=process.env.PARALLEL_API_KEY;process.env.PARALLEL_API_KEY='synthetic-private-provider-key';
  let effects=0;
  t.mock.method(globalThis,'fetch',async()=>{effects++;return Response.json({search_id:'synthetic',extract_id:'synthetic',id:'synthetic',results:[],output:[]});});
  try {
    for(const [name,run] of [
      ['search',()=>parallelSearch({userId:'11111111-1111-4111-8111-111111111111',objective:'public documentation',queries:['public docs']})],
      ['extract',()=>parallelExtract({userId:'11111111-1111-4111-8111-111111111111',objective:'public documentation',urls:['https://example.com/docs']})],
      ['responses',()=>parallelResponses({userId:'11111111-1111-4111-8111-111111111111',question:'public documentation',effort:'low'})],
    ] as const)await t.test(name,async()=>{await assert.rejects(run());assert.equal(effects,0);});
  } finally {if(prior===undefined)delete process.env.PARALLEL_API_KEY;else process.env.PARALLEL_API_KEY=prior;}
});

test('actual Parallel entries enforce issued context, current owner, egress, canonical holds and exact settlement',async t=>{
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',project='33333333-3333-4333-8333-333333333333';
  const context=createTenantContext({userId:owner,via:'remote_getuser'}),scope={context,userId:owner,projectId:project};
  const env={SUPABASE_URL:'http://127.0.0.1:55438',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',PARALLEL_API_KEY:'synthetic-platform-key',NODE_ENV:'test',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,26).toString('base64url')};
  const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  const confirmations=nativeReleaseFixture(owner);resetCredentialVaultRuntimeForTests();
  const reservations=new Map<string,Record<string,unknown>>(),releases:Record<string,unknown>[]=[],events:string[]=[],receipts:unknown[]=[];
  let mode='ok',ownerNow=owner,effects=0,controller:AbortController|undefined,mutate:(()=>void)|undefined;
  let executionRow:Record<string,unknown>|undefined;let publicOpens=0;
  t.mock.method(dns,'lookup',(async()=>{if(mode==='cancelAtDns'&&confirmations.row)confirmations.row.status='cancelled';return[{address:mode==='privateDns'?'169.254.169.254':'8.8.8.8',family:4}];}) as unknown as typeof dns.lookup);
  t.mock.method(https,'request',((url:URL,options:https.RequestOptions,callback:(r:unknown)=>void)=>{publicOpens++;assert.deepEqual(Object.keys(options.headers??{}).sort(),['Accept','Accept-Encoding'].sort());assert.equal(options.agent,false);const request=new EventEmitter() as EventEmitter&{end:()=>void};request.end=()=>{queueMicrotask(()=>callback(Object.assign(Readable.from([mode==='publicPdf'?publicPdfFixture():Buffer.from('public document fixture')]),{statusCode:mode==='publicRedirect'?302:mode==='public503'?503:mode==='public403'?403:200,headers:mode==='publicRedirect'?{location:'https://127.0.0.1/private'}:{'content-type':mode==='publicPdf'?'application/pdf':mode==='badContent'?'application/octet-stream':'text/html'}})));};return request;}) as typeof https.request);
  syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)):{};
    if(url.origin==='https://api.parallel.ai'){
      effects++;events.push('provider');assert.equal(init?.redirect,'manual');assert.ok(init?.signal);assert.doesNotMatch(JSON.stringify(body),/SYNTHETIC_CREDENTIAL|substituted/);
      assert.equal(new Headers(init?.headers).get(url.pathname.endsWith('/responses')?'authorization':'x-api-key'),url.pathname.endsWith('/responses')?'Bearer synthetic-platform-key':'synthetic-platform-key');
      if(mode==='provider503')return Response.json({error:'synthetic outage'},{status:503});
      if(mode==='provider401'||mode==='provider403')return Response.json({error:'synthetic provider denial'},{status:mode==='provider401'?401:403});
      if(mode==='providerRedirect')return new Response(null,{status:307,headers:{location:'http://169.254.169.254/computeMetadata/v1/'}});
      if(mode==='lateCancel'){controller?.abort();if(confirmations.row)confirmations.row.status='cancelled';}
      if(mode==='rotateAfterResponse')process.env.PARALLEL_API_KEY='synthetic-rotated-platform-key';
      if(mode==='malformedResults')return Response.json({search_id:'synthetic-search',results:'untrusted malformed result'});
      if(mode==='missingProviderId')return Response.json({results:[]});
      if(mode==='credentialProviderId')return Response.json({search_id:'SYNTHETIC_CREDENTIAL_PROVIDER_RECEIPT',results:[]});
      return Response.json({search_id:'synthetic-search',extract_id:'synthetic-extract',id:'synthetic-response',results:[{url:'https://example.com/docs',title:'Docs',excerpts:['public fixture']}],output_text:'public response',output:[]});
    }
    assert.equal(url.origin,env.SUPABASE_URL,'No unmocked network is allowed');
    if(url.pathname.endsWith('/business_action_confirmations')||/\/(claim_business_action_confirmation|authorize_business_action_dispatch|finish_business_action_confirmation)$/.test(url.pathname))return (await confirmations.database(url,init))!;
    if(url.pathname==='/rest/v1/swarm_runs'){
      if(init?.method==='POST')return new Response(null,{status:201});
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);return Response.json(executionRow);
    }
    if(url.pathname==='/rest/v1/projects'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('id'),'eq.'+project);
      return Response.json(ownerNow===owner?{id:project}:null);
    }
    if(url.pathname==='/rest/v1/production_audit_log'){
      events.push('egress');receipts.push(body);if(mode==='cancelAtAudit'&&confirmations.row)confirmations.row.status='cancelled';
      if(mode==='auditFailure')return Response.json({message:'synthetic unavailable'},{status:503});
      return (await confirmations.database(url,init))!;
    }
    if(url.pathname==='/rest/v1/rpc/reserve_xroga_provider_budget'){
      events.push('reserve');assert.equal(body.p_user_id,owner);assert.equal(body.p_price_version,WEB_PRICE_VERSION);assert.equal(body.p_purpose,'daily_work');
      if(mode==='reservationFailure')return Response.json({message:'synthetic admission refusal'},{status:400});
      const row={id:randomUUID(),user_id:owner,idempotency_key:body.p_idempotency_key,internal_route:body.p_internal_route,price_version:body.p_price_version,purpose:body.p_purpose,status:'reserved',
        estimated_input_tokens:0,maximum_output_tokens:0,reserved_micro_usd:body.p_reservation_micro_usd};reservations.set(row.id,row);
      if(mode==='reservationWrongOwner')return Response.json({...row,user_id:other});
      if(mode==='revokeAtReservation')ownerNow=other;
      if(mode==='cancelAtReservation'){controller?.abort();if(confirmations.row)confirmations.row.status='cancelled';}
      if(mode==='rotateAtReservation')process.env.PARALLEL_API_KEY='synthetic-rotated-platform-key';
      if(mode==='staleRunAtReservation'&&executionRow)executionRow={...executionRow,lease_generation:randomUUID()};
      mutate?.();return Response.json(row);
    }
    if(url.pathname==='/rest/v1/rpc/settle_xroga_provider_budget'){
      events.push('settle');const row=reservations.get(body.p_reservation_id);assert.ok(row);assert.equal(body.p_user_id,owner);
      assert.equal(body.p_actual_micro_usd,row.reserved_micro_usd);assert.equal(body.p_actual_input_tokens,0);assert.equal(body.p_output_tokens,0);
      if(mode==='settlementFailure')return Response.json({message:'synthetic settlement unavailable'},{status:503});
      const result={...row,status:'settled',settled_micro_usd:body.p_actual_micro_usd,provider_request_id:body.p_provider_request_id,actual_input_tokens:0,cached_input_tokens:0,output_tokens:0,reasoning_tokens:0,tool_calls:0,search_calls:body.p_search_calls};
      return Response.json(mode==='settlementWrongCost'?{...result,settled_micro_usd:0}:result);
    }
    if(url.pathname==='/rest/v1/rpc/release_xroga_provider_budget'){releases.push(body);return Response.json(null);}
    if(url.pathname==='/rest/v1/xroga_billing_cycles')return Response.json({id:randomUUID()});
    if(url.pathname==='/rest/v1/xroga_web_usage')return new Response(null,{status:201});
    throw new Error('Unexpected synthetic path '+url.pathname);
  });
  const complete=async(pending:ReturnType<typeof parallelSearch>)=>{const result=await pending;assert.equal(result.needsConfirmation,true);assert.ok(confirmations.row);const receipt=await confirmBusinessAction(context,confirmations.row.id);const value=JSON.parse(receipt.execution.resultText).result;return{requestId:value.search_id??value.extract_id??value.id,result:value};};
  const search=(objective='public documentation')=>complete(parallelSearch({userId:owner,dispatchScope:scope,objective,queries:['public docs'],signal:controller?.signal}));
  try{
    const before=effects;
    for(const invalid of [owner,{...context},JSON.parse(JSON.stringify(context))])await assert.rejects(parallelSearch({userId:owner,dispatchScope:{...scope,context:invalid as TenantContext},objective:'public',queries:['docs']}));
    await assert.rejects(parallelSearch({userId:other,dispatchScope:scope,objective:'public',queries:['docs']}));assert.equal(effects,before);
    await t.test('project and user research text cannot self-declare public egress',async()=>{
      const count=effects;
      const pending=await parallelSearch({userId:owner,dispatchScope:scope,objective:'Internal acquisition target and unreleased customer contract notes',queries:['internal customer records']});assert.equal(pending.needsConfirmation,true);assert.equal(pending.requestId,undefined);
      assert.equal(effects,count,'No private query may dispatch without exact egress approval');
    });
    await t.test('fabricated admission, changed producer plan and foreign confirmation cannot dispatch',async()=>{
      const count=effects;
      await assert.rejects(executeParallelRequest({scope,userId:owner,operation:'search',body:{mode:'turbo',objective:'docs',search_queries:['docs']},admission:{marker:'native-research'}}));
      for(const tamper of ['changed-body','changed-account','foreign-confirmation']){
        await parallelSearch({userId:owner,dispatchScope:scope,objective:'public docs',queries:['docs']});const row=confirmations.row!;
        if(tamper==='foreign-confirmation')row.user_id=other;
        else{if(tamper==='changed-body')(row.plan.arguments.body as Record<string,unknown>).objective='substituted private query';else row.plan.authority!.connectedAccountId='foreign-account';row.plan.planDigest=actionPlanDigest(row.plan);row.plan_digest=row.plan.planDigest;}
        await assert.rejects(confirmBusinessAction(context,row.id));assert.equal(effects,count);
      }
    });
    for(const operation of ['search','extract','low','medium']){
      events.length=0;mode='ok';ownerNow=owner;
      const result=operation==='search'?await search():operation==='extract'?await complete(parallelExtract({userId:owner,dispatchScope:scope,objective:'read public docs',urls:['https://example.com/docs','https://example.com/faq']})):await complete(parallelResponses({userId:owner,dispatchScope:scope,question:'public docs',effort:operation as 'low'|'medium'}));
      assert.ok(result.requestId);if(operation==='extract'){assert.deepEqual(events,['egress']);assert.equal(publicOpens,2);continue;}assert.deepEqual(events,['egress','reserve','provider','settle']);
      const row=[...reservations.values()].at(-1)!;assert.equal(row.reserved_micro_usd,operation==='search'?1000:operation==='low'?10000:50000);
    }
    await t.test('native URL retrieval denies private DNS, redirects and cancellation after DNS without delegated fetch',async()=>{
      for(const denied of ['privateDns','publicRedirect','cancelAtDns']){mode=denied;const prior=effects,opened=publicOpens;await assert.rejects(complete(parallelExtract({userId:owner,dispatchScope:scope,objective:'read public docs',urls:['https://example.com/docs']})));assert.equal(effects,prior);assert.equal(publicOpens,opened+(denied==='publicRedirect'?1:0));}mode='ok';
    });
    await t.test('native public PDF and fresh recovery keep supported reads with zero provider charge',async()=>{
      const extract=()=>complete(parallelExtract({userId:owner,dispatchScope:scope,objective:'read public docs',urls:['https://example.com/docs']}));
      mode='publicPdf';const pdf=await extract();assert.match(pdf.result.results[0].excerpts[0],/Public PDF fixture/);assert.equal(pdf.result.usage.providerMicroUsd,0);
      for(const denied of ['public503','public403','badContent']){mode=denied;await assert.rejects(extract());}
      mode='ok';assert.ok((await extract()).requestId);
    });
    for(const failure of ['foreignProject','auditFailure','reservationFailure','reservationWrongOwner','revokeAtReservation','cancelAtReservation','cancelAtAudit']){
      mode=failure;ownerNow=failure==='foreignProject'?other:owner;controller=new AbortController();const count=effects;
      await assert.rejects(search());assert.equal(effects,count,failure);
    }
    controller=undefined;ownerNow=owner;mode='ok';const count=effects;
    await assert.rejects(search('SYNTHETIC_CREDENTIAL_CANARY_MUST_NOT_LEAVE'),e=>{assert.equal(isTerminalModelFailure(e),true);return true;});assert.equal(effects,count);
    assert.ok(!JSON.stringify(receipts).includes('SYNTHETIC_CREDENTIAL_CANARY'));
    for(const failure of ['settlementFailure','settlementWrongCost','missingProviderId','credentialProviderId','malformedResults']){
      mode=failure;const before=effects;
      await assert.rejects(search(),e=>{assert.equal((e as {code?:string}).code,'POST_COMPLETION_ACCOUNTING_UNCERTAIN');assert.equal(isTerminalModelFailure(e),true);return true;});
      assert.equal(effects,before+1);assert.equal(releases.at(-1)?.p_pending_reconciliation,true);
    }
    mode='providerRedirect';await assert.rejects(search(),error=>{assert.equal(isTerminalModelFailure(error),true,'Provider redirects cannot become ordinary availability failures');return true;});
    assert.equal(releases.at(-1)?.p_pending_reconciliation,true);
    await t.test('provider authorization denial cannot enter availability fallback',async()=>{
      for(const denied of ['provider401','provider403']){
        mode=denied;const before=effects;
        await assert.rejects(search(),error=>{assert.equal(isTerminalModelFailure(error),true,denied);return true;});
        assert.equal(effects,before+1,'No second provider dispatch after security denial');
      }
    });
    await t.test('platform credential rotation invalidates reservation admission and publication',async()=>{
      try{
        for(const at of ['rotateAtReservation','rotateAfterResponse']){
          process.env.PARALLEL_API_KEY=env.PARALLEL_API_KEY;mode=at;const before=effects;
          await assert.rejects(search(),error=>{assert.equal(isTerminalModelFailure(error),true,at);return true;});
          assert.equal(effects,before+(at==='rotateAtReservation'?0:1),at);
        }
      }finally{process.env.PARALLEL_API_KEY=env.PARALLEL_API_KEY;}
    });
    mode='provider503';await assert.rejects(search(),/503/);mode='ok';assert.ok((await search()).requestId,'ordinary authorized recovery remains available');
    const mutable={userId:owner,dispatchScope:scope,objective:'public original',queries:['public original']};mutate=()=>{mutable.objective='substituted';mutable.queries[0]='substituted';};
    await complete(parallelSearch(mutable));mutate=undefined;
    controller=new AbortController();mode='lateCancel';const beforeCancellation=effects;
    await assert.rejects(search(),error=>{assert.ok(isTerminalModelFailure(error)||(error as {code?:string}).code==='BUSINESS_ACTION_CONFIRMATION_FINALIZE_FAILED');return true;});assert.equal(effects,beforeCancellation+1);const cancelledGrant=confirmations.row!.id;await assert.rejects(confirmBusinessAction(context,cancelledGrant));assert.equal(effects,beforeCancellation+1);
    controller=undefined;mode='ok';ownerNow=owner;
    const runId=randomUUID(),attempt=await withRunAttempt(async()=>{await createRunDurable(owner,'Synthetic research dispatch',runId,project);return captureAdmittedRunAttempt(runId,owner);});
    const current={id:runId,user_id:owner,project_id:project,status:'running',worker_id:attempt.workerId,lease_generation:attempt.generation};
    const runSearch=(runAttempt=attempt)=>complete(parallelSearch({userId:owner,dispatchScope:{...scope,runAttempt},objective:'public',queries:['docs']}));
    executionRow={...current};assert.ok((await runSearch()).requestId);
    const beforeLeaseDenials=effects;
    await assert.rejects(runSearch({...attempt}),{code:'RUN_STATE_CONFLICT'});
    for(const change of [{status:'cancelled'},{worker_id:'foreign-worker'},{lease_generation:randomUUID()},{project_id:randomUUID()},{user_id:other}]){
      executionRow={...current,...change};await assert.rejects(runSearch());assert.equal(effects,beforeLeaseDenials);
    }
    executionRow={...current};mode='staleRunAtReservation';await assert.rejects(runSearch());assert.equal(effects,beforeLeaseDenials);
  }finally{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
