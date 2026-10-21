import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import router from './profile.js';
import type { AuthRequest } from '../middleware/auth.js';
import { createTenantContext } from '../security/tenantContext.js';

test('account deletion freshly verifies the original issued owner and fails closed before admin deletion', async t => {
  const owner='11111111-1111-4111-8111-111111111111', foreign='22222222-2222-4222-8222-222222222222';
  const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL='http://127.0.0.1:1';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const realFetch=globalThis.fetch;
  // Auth SDK logs a synthetic transport exception internally. Keep fixture
  // diagnostics quiet; response assertions below still enforce safe failures.
  t.mock.method(console,'error',()=>{});
  let mode='success', activeRequest:AuthRequest|undefined;
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));assert.equal(url.origin,'http://127.0.0.1:1');
    calls.push(`${init?.method??'GET'} ${url.pathname}`);
    if(url.pathname==='/auth/v1/user') {
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-request-token');
      if(mode==='outage')return Response.json({message:'PRIVATE_CANARY'},{status:503});
      if(mode==='rejected')return Response.json({message:'PRIVATE_CANARY'},{status:401});
      if(mode==='transport')throw new Error('PRIVATE_CANARY');
      if(mode==='deleted')return Response.json({user:null});
      if(mode==='mutated-request')activeRequest!.userId=foreign;
      return Response.json({id:mode==='foreign'?foreign:owner,email:'fixture@example.invalid'});
    }
    assert.equal(url.pathname,`/auth/v1/admin/users/${owner}`);
    assert.equal(init?.method,'DELETE');
    if(mode==='delete-failure')return Response.json({message:'PRIVATE_CANARY'},{status:503});
    return Response.json({id:owner});
  });
  const app=express();app.use(express.json());
  app.use((req:AuthRequest,_res,next)=>{
    req.tenantContext=createTenantContext({userId:owner,via:'local_jwt'});
    req.userId=foreign;
    if(mode!=='missing-token')req.accessToken='synthetic-request-token';
    activeRequest=req;next();
  });
  app.use(router);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{
    server.close();await once(server,'close');
    if(previous.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previous.url;
    if(previous.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous.key;
  });
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const send=(body:unknown={confirm:'DELETE'})=>realFetch(`http://127.0.0.1:${address.port}/`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  for(const [scenario,status] of [['missing-token',401],['foreign',401],['deleted',401],['rejected',401],['outage',503],['transport',503]] as const) {
    mode=scenario;calls.length=0;
    const response=await send();assert.equal(response.status,status,scenario);
    assert.ok(!(await response.text()).includes('PRIVATE_CANARY'));
    assert.ok(calls.every(call=>!call.startsWith('DELETE')),scenario);
  }
  mode='success';calls.length=0;
  assert.equal((await send({confirm:'DELETE',userId:foreign})).status,400);assert.deepEqual(calls,[]);
  for(mode of ['success','mutated-request']) {
    calls.length=0;const response=await send();assert.equal(response.status,200);assert.deepEqual(await response.json(),{deleted:true});
    assert.deepEqual(calls,['GET /auth/v1/user',`DELETE /auth/v1/admin/users/${owner}`]);
  }
  mode='delete-failure';const response=await send();assert.equal(response.status,503);assert.ok(!(await response.text()).includes('PRIVATE_CANARY'));
});
