import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {AuthorityError} from '../security/authority/enforce.js';

test('actual Expo pipeline prepares exact approval, preserves terminal denials and never starts another action',async()=>{
 const source=readFileSync(new URL('./pipeline.ts',import.meta.url),'utf8');
 const start=source.indexOf('  // Expo: prepare one exact build approval'),end=source.indexOf('  // Acknowledge the final snapshot',start);
 assert.ok(start>0&&end>start);
 const javascript=ts.transpileModule(`globalThis.run=async()=>{${source.slice(start,end)}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 for(const mode of ['prepared','store-denied','ownership-denied','outage','authorized-after-outage']){
  let preparations=0,extraActions=0;const events:Array<{status:string;message:string}>=[],actor={},signal=new AbortController().signal,sha='a'.repeat(40),url='/dashboard/actions/confirm/11111111-1111-4111-8111-111111111111';
  const forbidden=async()=>{extraActions++;throw new Error('Unexpected action');};
  const context:Record<string,unknown>={githubPushConfirmed:true,productScaffoldKind:'expo',githubBranch:'main',commitSha:sha,admittedDatabaseProjectId:'owned-project',projectName:'fixture',opts:{userId:'owner',signal},tenantContext:actor,isTerminalModelFailure:(error:unknown)=>error instanceof AuthorityError,
   getUserProviderKey:forbidden,syncGooglePlayCredentialsToExpo:forbidden,syncAppleAscApiKeyToExpo:forbidden,listEasBuilds:forbidden,waitForEasBuildArtifact:forbidden,
   triggerEasPublish:async(input:{tenantContext:unknown;signal:unknown;gitRef:string;submit:boolean})=>{preparations++;assert.equal(input.tenantContext,actor);assert.equal(input.signal,signal);assert.equal(input.gitRef,sha);assert.equal(input.submit,false);if(mode.endsWith('-denied'))throw new AuthorityError('EXPO_ACTION_DENIED');if(mode==='outage')throw new Error('Synthetic provider unavailable');return{ok:false,needsConfirmation:true,reviewUrl:url};},emit:(event:{status:string;message:string})=>events.push(event),todos:()=>[]};
  vm.runInNewContext(javascript,context,{timeout:1000});
  if(mode.endsWith('-denied'))await assert.rejects((context.run as()=>Promise<void>)(),error=>error instanceof AuthorityError);else await(context.run as()=>Promise<void>)();
  assert.equal(preparations,1);assert.equal(extraActions,0);assert.equal(events.some(event=>['eas_started','eas_ready','eas_ios_started'].includes(event.status)),false);
  if(mode==='prepared'||mode==='authorized-after-outage')assert.ok(events.some(event=>event.status==='confirmation_required'&&event.message.includes(url)));
 }
});
