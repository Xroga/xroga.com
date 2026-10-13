import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createTenantContext } from './tenantContext.js';
import { persistOwnedTerminal } from './ownedTerminalPersistence.js';
import { TenantAccessError } from './tenantErrors.js';
const owner='11111111-1111-4111-8111-111111111111';
test('terminal autosave ignores collisions, scopes updates and returns only requested metadata',async()=>{
  let foreign=false;const requests:{url:URL;method:string;headers:Headers}[]=[];
  const db=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    requests.push({url:new URL(String(input)),method:init?.method??'GET',headers:new Headers(init?.headers)});
    return new Response(JSON.stringify(init?.method==='PATCH'?(foreign?null:{id:'terminal'}):[]),{headers:{'Content-Type':'application/json'}});
  }}});
  const context=createTenantContext({userId:owner,via:'local_jwt'});
  const result=await persistOwnedTerminal(db,context,{id:'terminal',user_id:owner,messages:[{content:'Own fixture'}]},'id,title');
  assert.equal(result.error,null);assert.deepEqual(result.data,{id:'terminal'});
  assert.match(requests[0].headers.get('Prefer')??'',/resolution=ignore-duplicates/);
  assert.equal(requests[1].url.searchParams.get('user_id'),`eq.${owner}`);
  assert.equal(requests[1].url.searchParams.get('select'),'id,title');
  foreign=true;
  await assert.rejects(persistOwnedTerminal(db,context,{id:'terminal',user_id:owner},'id'),error=>error instanceof TenantAccessError&&error.status===404);
});
test('duplicate terminal-number error remains available only for bounded internal retry',async()=>{
  const db=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>new Response(JSON.stringify({code:'23505',message:'Fixture unique terminal_number'}),{status:409,headers:{'Content-Type':'application/json'}})}});
  const result=await persistOwnedTerminal(db,createTenantContext({userId:owner,via:'local_jwt'}),{id:'terminal',user_id:owner},'id');
  assert.equal(result.error?.code,'23505');assert.equal(result.data,null);
});
