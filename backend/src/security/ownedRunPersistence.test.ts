import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { persistOwnedRun, persistOwnedRuntimeSession, persistOwnedRunTrace, persistOwnedUniversalRecord } from './ownedRunPersistence.js';
import { createTenantContext } from './tenantContext.js';
import { TenantAccessError } from './tenantErrors.js';
const owner='11111111-1111-4111-8111-111111111111';
const context=createTenantContext({userId:owner,via:'persisted_owner'});
test('owner-bound writer snapshots identity and nested data across the insertion await',async()=>{
  const row={id:'original',user_id:owner,output:{text:'original'}};
  const requests:{url:URL;body:unknown}[]=[];
  const db=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    requests.push({url:new URL(String(input)),body:JSON.parse(String(init?.body))});
    if(init?.method==='POST'){
      row.id='changed';row.user_id='22222222-2222-4222-8222-222222222222';row.output.text='changed';
    }
    return new Response(JSON.stringify(init?.method==='PATCH'?[{id:'original'}]:[]),{headers:{'Content-Type':'application/json'}});
  }}});
  await persistOwnedRun(db,context,row);
  assert.deepEqual(requests[0].body,{id:'original',user_id:owner,output:{text:'original'}});
  assert.deepEqual(requests[1].body,requests[0].body);
  assert.equal(requests[1].url.searchParams.get('id'),'eq.original');
  assert.equal(requests[1].url.searchParams.get('user_id'),`eq.${owner}`);
});

test('append-only verification uses the inserted snapshot after caller mutation',async()=>{
  const row={mutation_key:'original',user_id:owner,run_id:'original-run',project_id:'original-project'};
  const requests:URL[]=[];
  const db=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    requests.push(new URL(String(input)));
    if(init?.method==='POST')Object.assign(row,{mutation_key:'changed',user_id:'other',run_id:'changed-run',project_id:'changed-project'});
    return new Response(JSON.stringify(init?.method==='POST'?[]:[{mutation_key:'original'}]),{headers:{'Content-Type':'application/json'}});
  }}});
  await persistOwnedUniversalRecord(db,context,'mutation',row);
  assert.equal(requests[1].searchParams.get('mutation_key'),'eq.original');
  assert.equal(requests[1].searchParams.get('user_id'),`eq.${owner}`);
  assert.equal(requests[1].searchParams.get('run_id'),'eq.original-run');
  assert.equal(requests[1].searchParams.get('project_id'),'eq.original-project');
});
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

test('existing runtime-session writer uses the same collision-safe owner boundary',async()=>{
  const requests:URL[]=[];
  const db=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    requests.push(new URL(String(input)));
    if(init?.method==='POST') assert.match(new Headers(init.headers).get('Prefer')??'',/ignore-duplicates/);
    return new Response(JSON.stringify([]),{headers:{'Content-Type':'application/json'}});
  }}});
  await assert.rejects(persistOwnedRuntimeSession(db,context,{session_id:'foreign-session',user_id:owner}),error=>error instanceof TenantAccessError&&error.status===404);
  assert.equal(requests[1].pathname,'/rest/v1/project_runtime_sessions');
  assert.equal(requests[1].searchParams.get('session_id'),'eq.foreign-session');
  assert.equal(requests[1].searchParams.get('user_id'),`eq.${owner}`);
});

test('trace collision cannot merge another owner and rejects a forged write owner before persistence',async()=>{
  const requests:{url:URL;method:string;headers:Headers}[]=[];
  const db=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    requests.push({url:new URL(String(input)),method:init?.method??'GET',headers:new Headers(init?.headers)});
    return new Response('[]',{headers:{'Content-Type':'application/json'}});
  }}});
  await assert.rejects(persistOwnedRunTrace(db,context,{run_id:'foreign-trace',user_id:owner,stages:[],meta:{}}),{status:404});
  assert.match(requests[0].headers.get('Prefer')??'',/ignore-duplicates/);assert.equal(requests[1].url.searchParams.get('run_id'),'eq.foreign-trace');assert.equal(requests[1].url.searchParams.get('user_id'),`eq.${owner}`);
  const count=requests.length;
  await assert.rejects(persistOwnedRunTrace(db,context,{run_id:'foreign-trace',user_id:'22222222-2222-4222-8222-222222222222'}),TenantAccessError);assert.equal(requests.length,count);
});
