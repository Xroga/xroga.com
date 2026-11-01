import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('actual Supabase picker exposes only a local approval link and never treats keys or partial setup as execution proof',async()=>{
 const text=readFileSync(new URL('../../../frontend/src/components/integrations/SupabaseConnectPanel.tsx',import.meta.url),'utf8');
 const start=text.indexOf('  async function selectProject('),end=text.indexOf('  async function createProject()',start);assert.ok(start>0&&end>start);
 const ast=ts.createSourceFile('SupabaseConnectPanel.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let validator='';
 function visit(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='reviewLink')validator=n.initializer!.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(validator);
 const script=ts.transpileModule(`const reviewLink=${validator};globalThis.run=${text.slice(start,end).replace('async function selectProject','async function')}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const local='/dashboard/actions/confirm/11111111-1111-4111-8111-111111111111';
 for(const mode of ['pending','foreign-url','javascript-url','keys-ready','partial','verified','denied']){
  const state:{url?:string;ready:boolean;calls:number;connected:number;success:number;errors:number}={url:local,ready:false,calls:0,connected:0,success:0,errors:0};
  const response=mode==='pending'||mode.endsWith('-url')?{ok:false,provision:{needsConfirmation:true,reviewUrl:mode==='foreign-url'?'https://foreign.invalid/collect':mode==='javascript-url'?'javascript:alert(1)':local}}:
   mode==='keys-ready'?{ok:true,status:{ready:true}}:{ok:true,provision:{ok:true,schemaApplied:true,memoryTablesReady:mode==='verified'}};
  const context:Record<string,unknown>={api:{supabase:{selectProject:async()=>{state.calls++;if(mode==='denied')throw new Error('Access denied');return response;}}},setBusy:()=>{},setReviewUrl:(value?:string)=>{state.url=value;},setProvisioned:(value:boolean)=>{state.ready=value;},setMessage:()=>{},onConnected:()=>{state.connected++;},refresh:async()=>{},toast:{success:()=>{state.success++;},error:()=>{state.errors++;}}};
  vm.runInNewContext(script,context,{timeout:1000});await(context.run as(p:unknown)=>Promise<void>)({id:'ownedproject',ref:'ownedproject',name:'Owned project'});
  assert.equal(state.calls,1);
  if(mode==='pending'){assert.equal(state.url,local);assert.equal(state.ready,false);assert.equal(state.connected,0);assert.equal(state.success,0);}
  else if(mode==='verified'){assert.equal(state.ready,true);assert.equal(state.connected,1);assert.equal(state.success,1);}
  else{assert.equal(state.url,undefined);assert.equal(state.ready,false);assert.equal(state.connected,0);assert.equal(state.errors,1);}
 }
});
