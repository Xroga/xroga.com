import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import {createTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {listSupabaseProjects,fetchProjectApiKeys,runSqlViaManagementApi,runSqlViaDatabasePassword,ensureStorageBuckets,provisionUserSupabase,oneClickConnectSupabase,getUserSupabaseManagementToken} from './supabaseProvision.js';

// Exercise exported production functions. Test provider replies are synthetic.
test('Supabase provisioning exports reject missing or fabricated actors before credential access or provider effects',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',issued=createTenantContext({userId:owner,via:'remote_getuser'});
 let wire=0,password=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{
  wire++;const url=String(input);
  if(url.includes('/api-keys'))return Response.json([{name:'anon',api_key:'SYNTHETIC_ANON'},{name:'service_role',api_key:'SYNTHETIC_SERVICE'}]);
  if(url.includes('/storage/'))return Response.json([{id:'xroga-uploads',public:false},{id:'fixtureproject-uploads',public:false}]);
  return Response.json([]);
 });
 t.mock.method(pg.Client.prototype,'connect',async()=>{password++;throw new Error('Unexpected password access');});
 for(const context of [undefined,{...issued}] as Array<TenantContext|undefined>){
  const invoke=(fn:Function,...args:unknown[])=>fn(...args);
  for(const [name,operation] of [
   ['list',()=>invoke(listSupabaseProjects,'SYNTHETIC_PAT',context)],
   ['keys',()=>invoke(fetchProjectApiKeys,'SYNTHETIC_PAT','fixtureproject',context)],
   ['SQL',()=>invoke(runSqlViaManagementApi,'SYNTHETIC_PAT','fixtureproject','select 1',context)],
   ['password',()=>invoke(runSqlViaDatabasePassword,'fixtureproject','SYNTHETIC_PASSWORD','select 1','us-east-1',context)],
   ['storage',()=>invoke(ensureStorageBuckets,'https://fixtureproject.supabase.co','SYNTHETIC_SERVICE',['xroga-uploads'],context)],
   ['provision',()=>provisionUserSupabase({userId:owner,projectUrl:'https://fixtureproject.supabase.co',serviceRoleKey:'SYNTHETIC_SERVICE',...{tenantContext:context}})],
   ['connect',()=>oneClickConnectSupabase({userId:owner,accessToken:'SYNTHETIC_PAT',projectRef:'fixtureproject',...{tenantContext:context}})],
   ['management credential',()=>invoke(getUserSupabaseManagementToken,owner,context)],
  ] as const)await t.test(name+' '+(context?'fabricated':'missing'),async()=>{
   const before=wire;await assert.rejects(operation(),{code:'TENANT_AUTH_REQUIRED'});assert.equal(wire,before);assert.equal(password,0);
  });
 }
});
