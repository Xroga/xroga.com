import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {listSupabaseProjects,fetchProjectApiKeys,provisionUserSupabase} from './supabaseProvision.js';

test('management redirects cannot forward authentication or trigger delegated requests',async t=>{
 const nativeFetch=globalThis.fetch;let forwarded=0;
 const sink=createServer((_req,res)=>{forwarded++;res.writeHead(200,{'content-type':'application/json'}).end('[]');});
 const source=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end());
 await new Promise<void>(resolve=>sink.listen(0,'127.0.0.1',resolve));await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  assert.equal(String(input),'https://api.supabase.com/v1/projects');return nativeFetch(`http://127.0.0.1:${(source.address() as AddressInfo).port}/`,init);
 });
 try{await assert.rejects(listSupabaseProjects('SYNTHETIC_MANAGEMENT_TOKEN'),{code:'SUPABASE_MANAGEMENT_DENIED'});assert.equal(forwarded,0);}
 finally{source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);}
});

test('management authorization and unsafe receipts stop SQL password fallback and storage effects',async t=>{
 for(const status of [401,403,307]){
  let management=0,storage=0,passwordConnections=0;
  t.mock.method(pg.Client.prototype,'connect',async()=>{passwordConnections++;throw new Error('SYNTHETIC_PASSWORD_CONNECTION');});
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{
   if(new URL(String(input)).hostname==='api.supabase.com'){management++;return Response.json({message:'SYNTHETIC_SECRET_CANARY'},{status});}
   storage++;return Response.json([]);
  });
  try{await assert.rejects(provisionUserSupabase({projectUrl:'https://fixtureproject.supabase.co',serviceRoleKey:'SYNTHETIC_SERVICE',accessToken:'SYNTHETIC_PAT',dbPassword:'SYNTHETIC_PASSWORD'}),{code:'SUPABASE_MANAGEMENT_DENIED'});
   assert.equal(management,1);assert.equal(passwordConnections,0);assert.equal(storage,0);
  }finally{t.mock.restoreAll();}
 }
});

test('management transport and malformed response failures never expose provider credential material',async t=>{
 const canary='SYNTHETIC_PAT_CANARY';
 for(const receipt of ['network','stream','json','oversized','shape']){
  t.mock.method(globalThis,'fetch',async()=>{
   if(receipt==='network')throw new Error(canary);
   if(receipt==='stream')return new Response(new ReadableStream({start(controller){controller.error(new Error(canary));}}));
   return new Response(receipt==='json'?canary:receipt==='oversized'?'x'.repeat(2*1024*1024+1):JSON.stringify({providerError:canary}));
  });
  try{await assert.rejects(listSupabaseProjects('SYNTHETIC_PAT'),error=>{assert.ok(!String(error).includes(canary));return true;});}
  finally{t.mock.restoreAll();}
 }
});

test('management project refs select documented ref rather than opaque id',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json([{id:'opaque-id',ref:'abcdefghijklmnopqrst',name:'Owned project',organization_id:'owned-org',region:'us-east-1'}]));
 const result=await listSupabaseProjects('SYNTHETIC_PAT');assert.equal(result[0]?.ref,'abcdefghijklmnopqrst');
});

test('invalid key targets are rejected before credential-bearing requests',async t=>{
 const transport=t.mock.method(globalThis,'fetch',async()=>Response.json([{name:'anon',api_key:'SYNTHETIC_ANON'},{name:'service_role',api_key:'SYNTHETIC_SERVICE'}]));
 for(const ref of ['../foreign','foreign/path','x?reveal=false','UPPERCASE','', 'a'.repeat(64)])await assert.rejects(fetchProjectApiKeys('SYNTHETIC_PAT',ref),{code:'SUPABASE_MANAGEMENT_DENIED'});
 assert.equal(transport.mock.callCount(),0);
});

test('uncertain management SQL network and stream failures cannot start password fallback or storage',async t=>{
 for(const failure of ['network','stream']){
  let passwordConnections=0,storage=0;
  t.mock.method(pg.Client.prototype,'connect',async()=>{passwordConnections++;throw new Error('UNEXPECTED_PASSWORD_FALLBACK');});
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{
   if(new URL(String(input)).hostname==='api.supabase.com'){
    if(failure==='network')throw new Error('SYNTHETIC_CONNECTION_CLOSED_AFTER_WRITE');
    return new Response(new ReadableStream({start(controller){controller.error(new Error('SYNTHETIC_PARTIAL_SQL_REPLY'));}}));
   }
   storage++;return Response.json([{id:'xroga-uploads',public:false},{id:'fixtureproject-uploads',public:false}]);
  });
  try{await assert.rejects(provisionUserSupabase({projectUrl:'https://fixtureproject.supabase.co',serviceRoleKey:'SYNTHETIC_SERVICE',accessToken:'SYNTHETIC_PAT',dbPassword:'SYNTHETIC_PASSWORD'}),{code:'SUPABASE_MANAGEMENT_DENIED'});
   assert.equal(passwordConnections,0);assert.equal(storage,0);
  }finally{t.mock.restoreAll();}
 }
});

test('ordinary read unavailability permits a fresh request while key discovery remains bounded and secret fields stay server-only',async t=>{
 let attempts=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  attempts++;assert.equal(new Headers(init?.headers).get('authorization'),'Bearer SYNTHETIC_PAT');assert.equal(init?.redirect,'manual');assert.ok(init?.signal instanceof AbortSignal);
  if(attempts===1)return Response.json({message:'SYNTHETIC_PROVIDER_ERROR_CANARY'},{status:503});
  if(String(input).endsWith('/projects'))return Response.json([{id:'legacyref',name:'Owned project'}]);
  assert.equal(String(input),'https://api.supabase.com/v1/projects/legacyref/api-keys?reveal=true');
  return Response.json([{type:'publishable',name:'default',api_key:'SYNTHETIC_PUBLISHABLE'},{type:'secret',name:'default',api_key:'SYNTHETIC_SECRET'}]);
 });
 await assert.rejects(listSupabaseProjects('SYNTHETIC_PAT'),error=>{assert.ok(!String(error).includes('CANARY'));return true;});assert.equal(attempts,1);
 assert.equal((await listSupabaseProjects('SYNTHETIC_PAT'))[0]?.ref,'legacyref');assert.equal(attempts,2);
 assert.deepEqual(await fetchProjectApiKeys('SYNTHETIC_PAT','legacyref'),{url:'https://legacyref.supabase.co',anonKey:'SYNTHETIC_PUBLISHABLE',serviceRoleKey:'SYNTHETIC_SECRET'});assert.equal(attempts,3);
});

test('OAuth authority failures never switch to a saved PAT while ordinary unavailable refresh retains recovery',async()=>{
 const require=createRequire(import.meta.url);
 for(const code of ['SUPABASE_TRANSPORT_DENIED','AUTHORITY_STORE_UNAVAILABLE',null]){
  let patReads=0;const module:{exports:Record<string,unknown>}={exports:{}};
  const output=ts.transpileModule(readFileSync(new URL('./supabaseProvision.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(output,{exports:module.exports,module,Buffer,URL,AbortSignal,console,process,
   require:(id:string)=>id==='./supabaseAuth.js'?{getSupabaseOAuthAccessToken:async()=>{if(code)throw Object.assign(new Error('SYNTHETIC_AUTHORITY_FAILURE'),{code});return null;}}:
    id==='./userProviderKeys.js'?{getUserProviderKey:async()=>{patReads++;return 'SYNTHETIC_PAT';}}:require(id)});
  const lookup=module.exports.getUserSupabaseManagementToken as(user:string)=>Promise<string|null>;
  if(code){await assert.rejects(lookup('11111111-1111-4111-8111-111111111111'),{code});assert.equal(patReads,0);}
  else{assert.equal(await lookup('11111111-1111-4111-8111-111111111111'),'SYNTHETIC_PAT');assert.equal(patReads,1);}
 }
});

test('expired management request deadline stops before SQL password or storage fallback',async t=>{
 let connections=0,requests=0;
 t.mock.method(AbortSignal,'timeout',()=>AbortSignal.abort(new DOMException('Synthetic deadline','TimeoutError')));
 t.mock.method(pg.Client.prototype,'connect',async()=>{connections++;throw new Error('UNEXPECTED_PASSWORD_FALLBACK');});
 t.mock.method(globalThis,'fetch',async()=>{requests++;return Response.json([]);});
 await assert.rejects(provisionUserSupabase({projectUrl:'https://fixtureproject.supabase.co',serviceRoleKey:'SYNTHETIC_SERVICE',accessToken:'SYNTHETIC_PAT',dbPassword:'SYNTHETIC_PASSWORD'}),{name:'TimeoutError'});
 assert.equal(connections,0);assert.equal(requests,0);
});
