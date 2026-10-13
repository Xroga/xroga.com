import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { persistOwnedRun } from './ownedRunPersistence.js';
import { createTenantContext } from './tenantContext.js';
import { TenantAccessError } from './tenantErrors.js';
const owner='11111111-1111-4111-8111-111111111111';
const context=createTenantContext({userId:owner,via:'persisted_owner'});
test('durable writer never merges on conflict; mutation predicates include persisted owner',async()=>{
  let foreign=false;const requests:{method:string;url:URL;headers:Headers}[]=[];
  const db=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    requests.push({method:init?.method??'GET',url:new URL(String(input)),headers:new Headers(init?.headers)});
    return new Response(JSON.stringify(init?.method==='PATCH'?(foreign?[]:[{id:'run'}]):[]),{headers:{'Content-Type':'application/json'}});
  }}});
  await persistOwnedRun(db,context,{id:'run',user_id:owner,status:'running'});
  assert.match(requests[0].headers.get('Prefer')??'',/resolution=ignore-duplicates/);
  assert.doesNotMatch(requests[0].headers.get('Prefer')??'',/merge-duplicates/);
  assert.equal(requests[1].method,'PATCH');assert.equal(requests[1].url.searchParams.get('user_id'),`eq.${owner}`);
  foreign=true;
  await assert.rejects(persistOwnedRun(db,context,{id:'run',user_id:owner}),error=>error instanceof TenantAccessError&&error.status===404);
  const before=requests.length;
  await assert.rejects(persistOwnedRun(db,context,{id:'run',user_id:'22222222-2222-4222-8222-222222222222'}),TenantAccessError);
  assert.equal(requests.length,before);
});
