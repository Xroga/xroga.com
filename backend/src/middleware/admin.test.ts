import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canReadAdminOperations, adminMiddleware } from './admin.js';
import type { AuthRequest } from './auth.js';
import type { Response } from 'express';
import {createTenantContext} from '../security/tenantContext.js';

test('operational evidence keeps current admin/owner policy and denies ordinary roles', () => {
  for (const role of ['guest', 'member', 'moderator', 'founder', '', null, undefined]) {
    assert.equal(canReadAdminOperations(role), false, String(role));
  }
  assert.equal(canReadAdminOperations('admin'), true);
  assert.equal(canReadAdminOperations('owner'), true);
});

test('readiness route enforces admin middleware before querying operational evidence', async () => {
  const source = await readFile(new URL('../routes/operations.ts', import.meta.url), 'utf8');
  const indexSource = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
  assert.match(source, /router\.get\('\/readiness',\s*adminMiddleware,/);
  assert.match(indexSource, /app\.use\('\/api\/operations',\s*authMiddleware,/);
});

test('administrative middleware denies a legacy userId or deserialized context before role lookup',async()=>{
  for(const tenantContext of [undefined,{userId:'11111111-1111-4111-8111-111111111111'}]) {
    let status=0,body:unknown,nextCalled=false;
    const response={status(code:number){status=code;return this;},json(value:unknown){body=value;}} as Response;
    await adminMiddleware({userId:'11111111-1111-4111-8111-111111111111',tenantContext} as AuthRequest,response,()=>{nextCalled=true;});
    assert.equal(status,401);assert.deepEqual(body,{error:'Unauthorized'});assert.equal(nextCalled,false);
  }
});

test('administrative middleware binds the returned role receipt to the original issued actor',async()=>{
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='http://127.0.0.1:49236';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  let row:unknown={id:other,role:'admin'};
  globalThis.fetch=async input=>{
    const url=new URL(String(input));assert.equal(url.pathname,'/rest/v1/profiles');assert.equal(url.searchParams.get('id'),`eq.${owner}`);
    assert.equal(url.searchParams.get('select'),'role,id');return Response.json(row);
  };
  try{
    const context=createTenantContext({userId:owner,via:'remote_getuser'});
    for(const [receipt,allowed]of [[{id:other,role:'admin'},false],[{role:'owner'},false],[{id:owner,role:'admin'},true],[{id:owner,role:'owner'},true],[{id:owner,role:'member'},false]] as const){
      row=receipt;let status=0,called=false;
      const response={status(code:number){status=code;return this;},json(){}} as unknown as Response;
      await adminMiddleware({userId:owner,tenantContext:context} as AuthRequest,response,()=>{called=true;});
      assert.equal(called,allowed);assert.equal(status,allowed?0:403);
    }
  }finally{
    globalThis.fetch=oldFetch;
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  }
});
