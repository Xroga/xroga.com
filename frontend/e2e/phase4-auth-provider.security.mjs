import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../../package.json',import.meta.url)),ts=require('typescript');
function load(origin,transport=fetch){
  const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/supabase/authProviders.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:id=>{assert.equal(id,'./config');return{getSupabasePublicConfig:()=>({url:origin,publishableKey:'synthetic-public-key'})};},fetch:transport,AbortSignal,TextDecoder});return exports.requireGitHubProvider;
}

test('actual public Auth settings preflight refuses real redirects and oversized otherwise-valid settings',async()=>{
  let mode='redirect',outside=0;
  const sink=createServer((_req,res)=>{outside++;res.writeHead(200,{'content-type':'application/json'}).end('{"external":{"github":true}}');});
  const api=createServer((_req,res)=>mode==='redirect'?res.writeHead(307,{location:`http://127.0.0.1:${sink.address().port}/collect`}).end():res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({external:{github:true},padding:'x'.repeat(65537)})));
  await new Promise(r=>sink.listen(0,'127.0.0.1',r));await new Promise(r=>api.listen(0,'127.0.0.1',r));
  try{
    const preflight=load(`http://127.0.0.1:${api.address().port}`);
    let denied=false;try{await preflight();}catch{denied=true;}assert.equal(outside,0);assert.equal(denied,true);
    mode='oversized';await assert.rejects(preflight(),/Authentication provider status unavailable/);
  }finally{api.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>sink.close(r))]);}
});

test('public Auth settings remain a bounded read-only preflight rather than an authentication grant',async()=>{
  let cancelled=0;
  const positive=load('https://approved-project.supabase.co',async(url,init)=>{
    assert.equal(url,'https://approved-project.supabase.co/auth/v1/settings');assert.equal(init.redirect,'manual');assert.equal(init.headers.apikey,'synthetic-public-key');assert.equal(init.body,undefined);assert.ok(init.signal instanceof AbortSignal);return Response.json({external:{github:true}});
  });await positive();
  for(const value of [false,'true',null,undefined])await assert.rejects(load('https://approved-project.supabase.co',async()=>Response.json({external:{github:value}}))(),/GitHub provider is not enabled/);
  await assert.rejects(load('https://approved-project.supabase.co',async()=>new Response('{'))(),/Authentication provider status unavailable/);
  await assert.rejects(load('https://approved-project.supabase.co',async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(65537));},cancel(){cancelled++;}})))(),/Authentication provider status unavailable/);assert.equal(cancelled,1);
});
