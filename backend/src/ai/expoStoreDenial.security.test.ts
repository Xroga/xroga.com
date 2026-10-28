import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {AuthorityError} from '../security/authority/enforce.js';

test('actual pipeline stops native dispatch and the other store path after required Expo configuration denial',async()=>{
 const source=readFileSync(new URL('./pipeline.ts',import.meta.url),'utf8');
 const start=source.indexOf('  // Expo: auto-trigger EAS build'),end=source.indexOf('  // Acknowledge the final snapshot',start);
 assert.ok(start>0&&end>start);
 const javascript=ts.transpileModule(`globalThis.run=async()=>{${source.slice(start,end)}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 for(const platform of ['android','ios','baseline-denied']){
  let dispatches=0,verifications=0;
  const context:Record<string,unknown>={githubPushConfirmed:true,productScaffoldKind:'expo',githubBranch:'main',projectName:'fixture',opts:{userId:'owner'},tenantContext:{},AuthorityError,
   getUserProviderKey:async(_user:string,key:string)=>key==='expo'?'fixture-token':platform!=='baseline-denied'&&key===(platform==='android'?'google_play':'apple_asc_api')?'fixture-store':null,
   packageIdFromProjectName:()=> 'com.synthetic.fixture',
   syncGooglePlayCredentialsToExpo:async()=>{verifications++;return{ok:false,error:'EXPO_STORE_CONFIGURATION_REQUIRED',manualSetupRequired:true,message:'Configure directly in Expo.'};},
   syncAppleAscApiKeyToExpo:async()=>{verifications++;return{ok:false,error:'EXPO_STORE_CONFIGURATION_REQUIRED',manualSetupRequired:true,message:'Configure directly in Expo.'};},
   listEasBuilds:async()=>{if(platform==='baseline-denied')throw new AuthorityError('EXPO_ACCOUNT_ADMISSION_DENIED');return[];},triggerEasPublish:async()=>{dispatches++;return{ok:false,message:'Synthetic dispatch failed'};},emit:()=>{},todos:()=>[]};
  vm.runInNewContext(javascript,context,{timeout:1000});
  await assert.rejects((context.run as()=>Promise<void>)(),error=>error instanceof AuthorityError);
  assert.equal(verifications,platform==='baseline-denied'?0:1);assert.equal(dispatches,0);
 }
});
