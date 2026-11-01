import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../../security/tenantContext.js';
import {resumeBusinessWorkflowAfterConfirmation} from './businessWorkflowRuns.js';
import {AuthorityError} from '../../security/authority/enforce.js';
import {isTerminalModelFailure} from '../../ai/providerRuntime.js';
test('workflow read consent uses the existing waiting state without advancing or publishing evidence',async()=>{
 const text=readFileSync(new URL('./businessWorkflowRuns.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('workflow.ts',text,ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='advance');assert.ok(fn);
 const source=ts.transpileModule(fn.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,confirmation={id:'11111111-1111-4111-8111-111111111111'};let cancelled=0;const updates:Record<string,unknown>[]=[];
 const context:Record<string,unknown>={requireResourceOwner:()=>{},readBusinessData:async()=>({status:'confirmation_required',confirmation,reviewUrl:'/dashboard/actions/confirm/'+confirmation.id}),updateRun:async(_ctx:unknown,row:Record<string,unknown>,patch:Record<string,unknown>)=>{updates.push(patch);return{...row,...patch};},view:(row:unknown)=>row,cancelBusinessActionConfirmation:async()=>{cancelled++;},appendReadOutcome:async()=>{throw Error('Pending read must not publish an outcome');}};
 vm.runInNewContext(source+';globalThis.run=advance',context);const row={user_id:'owner',status:'running',step_index:0,steps:[{kind:'read',request:'Read current message'}],outcomes:[]};const result=await(context.run as(ctx:unknown,row:unknown)=>Promise<{run:{status:string;step_index:number};confirmation:typeof confirmation}>)({},row);
 assert.equal(result.run.status,'awaiting_confirmation');assert.equal(result.run.step_index,0);assert.equal(result.confirmation.id,confirmation.id);assert.equal(updates[0].current_confirmation_id,confirmation.id);assert.equal(cancelled,0);
});

test('connection preflight never falls back to public catalog after security denial',async()=>{
 const text=readFileSync(new URL('../../routes/phase1BusinessPreflight.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('preflight.ts',text,ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='connectionRequestResponse');assert.ok(fn);let fallback=0;
 const context:Record<string,unknown>={isTerminalModelFailure,isComposioConfigured:()=>true,getComposioCatalogToolkit:async()=>{throw new AuthorityError('COMPOSIO_CREDENTIAL_CHANGED');},listComposioCatalog:async()=>{fallback++;return{items:[]};}};
 vm.runInNewContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+';globalThis.run=connectionRequestResponse',context);
 await assert.rejects((context.run as(...args:unknown[])=>Promise<unknown>)('owner','Connect Gmail',['gmail'],{}));assert.equal(fallback,0);
});

test('confirmed read workflow preserves owner, cancellation, exact step and bounded evidence',async t=>{
 const owner=randomUUID(),actor=createTenantContext({userId:owner,via:'remote_getuser'}),env={SUPABASE_URL:'https://connect-workflow-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store'},prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const initial=()=>({id:randomUUID(),user_id:owner,request:'Exact two-step fixture',steps:[{kind:'action',request:'Create exact fixture',dependsOnPrevious:false},{kind:'read',request:'Read exact fixture',dependsOnPrevious:true}],outcomes:[],step_index:1,status:'awaiting_confirmation',current_confirmation_id:randomUUID(),failure_code:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
 let row=initial(),updates=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));assert.equal(url.origin,env.SUPABASE_URL);assert.equal(url.pathname,'/rest/v1/business_workflow_runs');assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
  if(url.searchParams.get('status')!=='eq.'+row.status)return Response.json(null);
  if(init?.method==='PATCH'){updates++;assert.equal(url.searchParams.get('step_index'),'eq.'+row.step_index);row={...row,...JSON.parse(String(init.body))};}
  return Response.json(row);
 });
 const execution={status:'success' as const,toolkit:'slack',toolSlug:'SLACK_GET_MESSAGES',resultText:'Verified exact read',resultDigest:'a'.repeat(64)};
 const result=await resumeBusinessWorkflowAfterConfirmation(actor,row.current_confirmation_id,execution);assert.equal(result?.run.status,'completed');assert.equal(result?.run.stepIndex,2);assert.equal(result?.run.outcomes[0]?.kind,'read');assert.equal(updates,2);
 row=initial();row.status='cancelled';const before=updates;assert.equal(await resumeBusinessWorkflowAfterConfirmation(actor,row.current_confirmation_id,execution),null);assert.equal(updates,before);
 row=initial();row.user_id=randomUUID();await assert.rejects(resumeBusinessWorkflowAfterConfirmation(actor,row.current_confirmation_id,execution),{code:'RESOURCE_NOT_FOUND'});assert.equal(updates,before);
 row=initial();const oversized=await resumeBusinessWorkflowAfterConfirmation(actor,row.current_confirmation_id,{...execution,resultText:'x'.repeat(8_001)});assert.equal(oversized?.run.status,'setup_required');assert.equal(oversized?.run.failureCode,'READ_RESULT_TOO_LARGE');assert.equal(oversized?.run.stepIndex,1);assert.equal(oversized?.run.outcomes.length,0);
});
