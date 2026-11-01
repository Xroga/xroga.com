import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {getSupabaseAdmin,createSupabaseClient} from './supabase.js';

test('actual Supabase SDK admin and user clients stop terminal redirects without retry and retain authorized ordinary requests',async()=>{
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];const previous=names.map(k=>process.env[k]);
  let mode='redirect',outside=0,requests=0,authorization='',apiKey='';
  const sink=createServer((_req,res)=>{outside++;res.writeHead(200,{'content-type':'application/json'}).end('[]');});
  const api=createServer((req,res)=>{
    requests++;authorization=String(req.headers.authorization??'');apiKey=String(req.headers.apikey??'');
    if(mode==='redirect'){res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end();return;}
    if(mode==='unavailable'){res.writeHead(503,{'content-type':'application/json'}).end('{"message":"synthetic unavailable"}');return;}
    res.writeHead(200,{'content-type':'application/json'}).end(req.url?.includes('/rpc/')?'{"ok":true}':'[{"id":"owned-fixture"}]');
  });await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  Object.assign(process.env,{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-role',SUPABASE_ANON_KEY:'synthetic-anon'});
  try{
    const admin=getSupabaseAdmin(),user=createSupabaseClient('synthetic-user-session');
    for(const client of [admin,user]){
      requests=0;const result=await client.from('security_fixture').select('id');assert.equal(result.data,null);assert.equal(result.error?.code,'CAPABILITY_AUTH_REQUIRED');assert.equal(requests,1,'A security denial cannot become an SDK network retry');assert.equal(outside,0);
    }
    mode='positive';assert.deepEqual((await admin.rpc('security_fixture',{p_fixture:true})).data,{ok:true});assert.equal(authorization,'Bearer synthetic-service-role');assert.equal(apiKey,'synthetic-service-role');
    assert.deepEqual((await user.from('security_fixture').select('id')).data,[{id:'owned-fixture'}]);assert.equal(authorization,'Bearer synthetic-user-session');assert.equal(apiKey,'synthetic-anon');
    // Installed SupabaseClient exposes this protected fetchWithAuth field at
    // runtime. Exercise the real configured SDK callback, not a transport stub.
    const transport=(admin as unknown as {fetch:typeof fetch}).fetch;
    requests=0;for(const destination of [`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`,origin.replace('://','://user:password@')+'/rest/v1/security_fixture',origin+'/rest/v1/security_fixture#fragment']){
      const denied=await transport(destination);assert.equal(denied.status,403);
    }
    await assert.rejects(transport(origin+'/rest/v1/security_fixture',{signal:AbortSignal.abort()}),{name:'AbortError'});assert.equal(requests,0);assert.equal(outside,0);
    mode='unavailable';assert.ok((await user.from('security_fixture').select('id')).error);
    mode='positive';assert.deepEqual((await user.from('security_fixture').select('id')).data,[{id:'owned-fixture'}]);
  }finally{api.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>api.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);names.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
