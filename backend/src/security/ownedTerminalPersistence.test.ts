import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createTenantContext } from './tenantContext.js';
import { persistOwnedTerminal } from './ownedTerminalPersistence.js';
import { TenantAccessError } from './tenantErrors.js';
const owner='11111111-1111-4111-8111-111111111111';
test('terminal autosave snapshots owner, key and transcript before insertion awaits',async()=>{
  const row={id:'original',user_id:owner,messages:[{content:'original'}]};
  const requests:{url:URL;body:unknown}[]=[];
  const db=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    requests.push({url:new URL(String(input)),body:JSON.parse(String(init?.body))});
    if(init?.method==='POST'){
      row.id='changed';row.user_id='22222222-2222-4222-8222-222222222222';row.messages[0].content='changed';
    }
    return new Response(JSON.stringify(init?.method==='PATCH'?{id:'original'}:[]),{headers:{'Content-Type':'application/json'}});
  }}});
  const result=await persistOwnedTerminal(db,createTenantContext({userId:owner,via:'local_jwt'}),row,'id');
  assert.deepEqual(result.data,{id:'original'});
  assert.deepEqual(requests[0].body,{id:'original',user_id:owner,messages:[{content:'original'}]});
  assert.deepEqual(requests[1].body,{messages:[{content:'original'}]});
  assert.equal(requests[1].url.searchParams.get('id'),'eq.original');
  assert.equal(requests[1].url.searchParams.get('user_id'),`eq.${owner}`);
});
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
test('terminal writer refuses transcripts, wildcard projections and malformed returned metadata',async()=>{
  let requests=0;
  const db=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(_input,init)=>{
    requests++;return new Response(JSON.stringify(init?.method==='PATCH'?'invalid-metadata':[]),{headers:{'Content-Type':'application/json'}});
  }}});
  const context=createTenantContext({userId:owner,via:'local_jwt'}),row={id:'terminal',user_id:owner};
  for(const columns of ['*','messages','id,prompt','','title'])await assert.rejects(persistOwnedTerminal(db,context,row,columns),TenantAccessError);
  assert.equal(requests,0);
  await assert.rejects(persistOwnedTerminal(db,context,row,'id'),error=>error instanceof TenantAccessError&&error.status===503);
});

test('a losing initial autosave cannot relocate the winning session or replace its number and creation time',async()=>{
  const original={id:'racing-terminal',user_id:owner,github_repo_name:'fixture/winner',terminal_number:3,created_at:'2026-01-01T00:00:00Z',messages:[{content:'winner'}]};
  const contender={...original,github_repo_name:'fixture/contender',terminal_number:9,created_at:'2026-02-02T00:00:00Z',messages:[{content:'latest content'}]};
  let stored=structuredClone(original),writes=0;
  const db=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const url=new URL(String(input));writes++;
    if(init?.method==='POST')return Response.json([]); // The other insert won this conflict.
    assert.equal(url.searchParams.get('id'),'eq.racing-terminal');assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
    const patch=JSON.parse(String(init?.body));
    for(const key of ['id','user_id','github_repo_name','terminal_number','created_at'])assert.equal(Object.hasOwn(patch,key),false);
    stored={...stored,...patch};return Response.json({...stored,prompt:'PRIVATE_TRANSCRIPT_CANARY'});
  }}});
  const result=await persistOwnedTerminal(db,createTenantContext({userId:owner,via:'local_jwt'}),contender,'id,github_repo_name,terminal_number,created_at');
  assert.equal(writes,2);assert.deepEqual(stored,{...original,messages:contender.messages});
  assert.deepEqual(result.data,{id:original.id,github_repo_name:original.github_repo_name,terminal_number:3,created_at:original.created_at});
});
