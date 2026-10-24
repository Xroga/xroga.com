import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureUserRecords } from './ensureUserRecords.js';
import { isUserProvisioned, resetProvisioningCache } from './userProvisioningCache.js';
import { createTenantContext, type TenantContext } from '../security/tenantContext.js';

test('provisioning requires issued identity and exact durable receipts before caching existence', async t => {
  const owner='11111111-1111-4111-8111-111111111111';
  const context=createTenantContext({userId:owner,via:'remote_getuser'});
  const prior=[process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY];
  process.env.SUPABASE_URL='http://127.0.0.1:49221';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  t.after(()=>{resetProvisioningCache();['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].forEach((key,index)=>{
    if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];
  });});
  let mode='existing',calls=0;
  const reads=new Map<string,number>();
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    calls++;const url=new URL(String(input));assert.equal(url.origin,'http://127.0.0.1:49221');
    const table=url.pathname.split('/').pop()!,field=table==='profiles'?'id':'user_id';
    assert.ok(['profiles','user_token_usage'].includes(table));
    if(init?.method==='POST'){
      const row=JSON.parse(String(init.body));assert.equal(row[field],owner);
      if(table==='profiles'){
        assert.equal(row.username,'xroga_11111111111');
        assert.match(row.username,/^[A-Za-z0-9_]{3,32}$/);
        assert.equal(Object.hasOwn(row,'role'),false);
      }
      assert.match(String(new Headers(init.headers).get('prefer')),/resolution=ignore-duplicates/);
      return new Response(null,{status:201});
    }
    assert.equal(url.searchParams.get(field),`eq.${owner}`);
    const count=(reads.get(table)??0)+1;reads.set(table,count);
    if(mode==='outage')return Response.json({message:'PRIVATE_CANARY'},{status:503});
    if(mode==='foreign')return Response.json({[field]:'foreign'});
    if(mode==='missing'||mode==='insert'&&count===1)return Response.json(null);
    return Response.json({[field]:owner});
  });
  await assert.rejects(ensureUserRecords({...context} as TenantContext),{code:'TENANT_AUTH_REQUIRED'});
  assert.equal(calls,0);
  for(mode of ['foreign','outage','missing']){
    resetProvisioningCache();reads.clear();
    await assert.rejects(ensureUserRecords(context),error=>{
      assert.equal((error as {code:string}).code,'RESOURCE_ACCESS_UNAVAILABLE');assert.doesNotMatch(String(error),/PRIVATE_CANARY/);return true;
    });
    assert.equal(isUserProvisioned(owner),false);
  }
  for(mode of ['existing','insert']){
    resetProvisioningCache();reads.clear();
    await Promise.all([ensureUserRecords(context),ensureUserRecords(context)]);
    assert.equal(isUserProvisioned(owner),true);
    assert.equal(reads.get('profiles'),mode==='insert'?2:1);
    assert.equal(reads.get('user_token_usage'),mode==='insert'?2:1);
    const before:number=calls;await ensureUserRecords(context);assert.equal(calls,before);
    await assert.rejects(ensureUserRecords({...context} as TenantContext),{code:'TENANT_AUTH_REQUIRED'});
  }
});
