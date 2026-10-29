import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {AuthorityError} from '../security/authority/enforce.js';
import {EgressDenied} from '../security/egress/egressPolicy.js';

test('actual pipeline keeps Supabase setup behind confirmation and preserves terminal denials',async()=>{
 const text=readFileSync(new URL('./pipeline.ts',import.meta.url),'utf8'),start=text.indexOf("  // Auto-provision user's Supabase"),end=text.indexOf('  // Security agent',start);assert.ok(start>0&&end>start);
 const script=ts.transpileModule(`globalThis.run=async()=>{${text.slice(start,end)}}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const mode of ['pending','owner-denied','source-denied','provider-denied','manager-denied','vault-denied','cancelled','outage','authorized-after-outage']){
  let calls=0;const events:Array<{status:string;message:string}>=[],signal=new AbortController().signal,actor={},url='/dashboard/actions/confirm/11111111-1111-4111-8111-111111111111';
  const api={readUserSupabaseBundle:async()=>{if(mode==='vault-denied')throw Object.assign(new Error('Vault denied'),{code:'CREDENTIAL_WRITE_CONFLICT'});return({projectUrl:'https://ownedproject.supabase.co',serviceRoleKey:'fixture-service'});},getUserSupabaseManagementToken:async()=>{if(mode==='manager-denied')throw Object.assign(new Error('Issuer denied'),{code:'SUPABASE_TRANSPORT_DENIED'});return 'fixture-pat';},provisionUserSupabase:async(input:{tenantContext:unknown;signal:unknown})=>{
   calls++;assert.equal(input.tenantContext,actor);assert.equal(input.signal,signal);
   if(mode.endsWith('-denied'))throw mode==='provider-denied'?Object.assign(new Error('Provider denied'),{code:'SUPABASE_MANAGEMENT_DENIED'}):new AuthorityError('SUPABASE_DENIED');
   if(mode==='cancelled')throw new DOMException('Cancelled','AbortError');if(mode==='outage')throw new Error('Unavailable');return{ok:false,needsConfirmation:true,reviewUrl:url};
  }};
  const context:Record<string,unknown>={require:()=>api,opts:{userId:'owner',signal},tenantContext:actor,projectName:'Owned project',emit:(event:{status:string;message:string})=>events.push(event),AuthorityError,EgressDenied,Error,DOMException,console:{warn:()=>{}}};
  vm.runInNewContext(script,context,{timeout:1000});
  if(mode.endsWith('-denied')||mode==='cancelled')await assert.rejects((context.run as()=>Promise<void>)());else await(context.run as()=>Promise<void>)();
  assert.equal(calls,['manager-denied','vault-denied'].includes(mode)?0:1);assert.equal(events.some(event=>event.status==='supabase_ready'),false);
  if(['pending','authorized-after-outage'].includes(mode))assert.ok(events.some(event=>event.status==='confirmation_required'&&event.message.includes(url)));
 }
});
