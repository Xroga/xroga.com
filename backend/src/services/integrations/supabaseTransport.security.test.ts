import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import vm from 'node:vm';
import ts from 'typescript';
import * as tenant from '../../security/tenantContext.js';
const require=createRequire(import.meta.url),owner='11111111-1111-4111-8111-111111111111';
function authFixture(expired=false){
  let saves=0;
  const store={consumePkceSession:async()=>({verifier:'synthetic-verifier',authorization_revision:'synthetic-revision',redirect_uri:'https://xroga.com/dashboard/integrations/supabase/callback'}),
    loadProviderToken:async()=>({credential_revision:'synthetic-revision',access_token:'synthetic-old',refresh_token:'synthetic-refresh',metadata:expired?{expires_at:'2020-01-01T00:00:00Z'}:{}}),
    storeProviderToken:async()=>{saves++;}};
  const exports:any={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./supabaseAuth.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,process,Buffer,URL,URLSearchParams,AbortSignal,Response,console,fetch:(...args:Parameters<typeof fetch>)=>fetch(...args),
      require:(id:string)=>id.endsWith('/oauthPkceStore.js')?store:id.endsWith('/tenantContext.js')?tenant:require(id)});
  return {exports,saves:()=>saves};
}
async function invoke(f:ReturnType<typeof authFixture>,operation:string){
  return operation==='exchange'?f.exports.exchangeSupabaseOAuthCode({tenantContext:tenant.createTenantContext({userId:owner,via:'remote_getuser'}),code:'synthetic-code',state:'synthetic-state',redirectUri:'https://xroga.com/dashboard/integrations/supabase/callback'}):f.exports.refreshSupabaseOAuthToken(owner,'synthetic-refresh');
}
test('actual Supabase token exchange and refresh reject real HTTP redirects before token storage',async t=>{
  const oldId=process.env.SUPABASE_OAUTH_CLIENT_ID,oldSecret=process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  process.env.SUPABASE_OAUTH_CLIENT_ID='synthetic-client';process.env.SUPABASE_OAUTH_CLIENT_SECRET='synthetic-client-secret';
  const nativeFetch=globalThis.fetch;let forwarded=0;
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(200,{'content-type':'application/json'}).end('{"access_token":"redirected-token"}');});
  const source=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end());
  await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{assert.equal(String(input),'https://api.supabase.com/v1/oauth/token');return nativeFetch(`http://127.0.0.1:${(source.address() as AddressInfo).port}/`,init);});
  try{for(const operation of ['exchange','refresh'])await t.test(operation,async()=>{
    forwarded=0;const f=authFixture();await assert.rejects(invoke(f,operation),{code:'SUPABASE_TRANSPORT_DENIED'});assert.equal(forwarded,0);assert.equal(f.saves(),0);
  });}finally{source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);
    if(oldId===undefined)delete process.env.SUPABASE_OAUTH_CLIENT_ID;else process.env.SUPABASE_OAUTH_CLIENT_ID=oldId;
    if(oldSecret===undefined)delete process.env.SUPABASE_OAUTH_CLIENT_SECRET;else process.env.SUPABASE_OAUTH_CLIENT_SECRET=oldSecret;
  }
});

test('Supabase token transport rejects oversized and malformed receipts without saving or using a stale-token fallback',async t=>{
  for(const body of ['{',JSON.stringify({access_token:42}),JSON.stringify({access_token:'contains space'}),JSON.stringify({access_token:'valid',expires_in:-1}),JSON.stringify({access_token:'valid',expires_in:1e20}),JSON.stringify({access_token:'valid',refresh_token:null}),JSON.stringify({access_token:'valid',token_type:'untrusted'}),'x'.repeat(65537)]){
    t.mock.method(globalThis,'fetch',async()=>new Response(body));
    const f=authFixture(true);
    await assert.rejects(f.exports.getSupabaseOAuthAccessToken(owner),{code:'SUPABASE_TRANSPORT_DENIED'});
    assert.equal(f.saves(),0);t.mock.restoreAll();
  }
});

test('normal authorized Supabase refresh retains the fixed issuer, bounded request, safe returned fields and revision-bound save',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    calls++;assert.equal(input,'https://api.supabase.com/v1/oauth/token');assert.equal(init?.method,'POST');assert.equal(init?.redirect,'manual');assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(String(init?.body),'grant_type=refresh_token&refresh_token=synthetic-refresh');
    return Response.json({access_token:'new-access',refresh_token:'new-refresh',token_type:'bearer',expires_in:3600,untrustedExtra:'ignored'});
  });
  const f=authFixture(),result=await invoke(f,'refresh');
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{access_token:'new-access',refresh_token:'new-refresh',token_type:'bearer',expires_in:3600});assert.equal(f.saves(),1);assert.equal(calls,1);
});

test('Supabase provider error descriptions cannot echo credentials into user-visible failure evidence',async t=>{
  const canary='SYNTHETIC_CLIENT_SECRET_CANARY';
  t.mock.method(globalThis,'fetch',async()=>Response.json({error_description:canary},{status:401}));
  const f=authFixture();await assert.rejects(invoke(f,'refresh'),error=>{assert.ok(!String(error).includes(canary));assert.match(String(error),/401/);return true;});assert.equal(f.saves(),0);
});

test('Supabase refresh authorization denial stays terminal while ordinary provider unavailability retains recovery semantics',async t=>{
  for(const status of [401,403]){
    t.mock.method(globalThis,'fetch',async()=>Response.json({error:'synthetic-denied'},{status}));
    const f=authFixture(true);await assert.rejects(f.exports.getSupabaseOAuthAccessToken(owner),{code:'SUPABASE_TRANSPORT_DENIED'});assert.equal(f.saves(),0);t.mock.restoreAll();
  }
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:'unavailable'},{status:503}));
  const f=authFixture(true);assert.equal(await f.exports.getSupabaseOAuthAccessToken(owner),null);assert.equal(f.saves(),0);
});
