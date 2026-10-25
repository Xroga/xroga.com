import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {pushNotification,buildCompletionNotification} from './notificationService.js';
import {createTenantContext,type TenantContext} from '../security/tenantContext.js';

test('notification persistence requires issued identity and matching receipt without raw diagnostics',async t=>{
  const owner=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'});
  const prior=[process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY];
  process.env.SUPABASE_URL='http://127.0.0.1:49233';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  t.after(()=>['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].forEach((key,i)=>{if(prior[i]===undefined)delete process.env[key];else process.env[key]=prior[i];}));
  let calls=0,mode='ok';const logs:unknown[][]=[];
  t.mock.method(console,'warn',(...args:unknown[])=>logs.push(args));
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));assert.equal(url.origin,'http://127.0.0.1:49233');assert.equal(url.pathname,'/rest/v1/notifications');
    assert.equal(init?.method,'POST');assert.equal(url.searchParams.get('select'),'id,user_id');
    assert.equal(JSON.parse(String(init?.body)).user_id,owner);calls++;
    if(mode==='outage')return Response.json({message:'PRIVATE_PROVIDER_CANARY'},{status:503});
    return Response.json(mode==='missing'?null:{id:mode==='empty'?'':'saved-id',user_id:mode==='foreign'?randomUUID():owner});
  });
  const input={title:'Synthetic title',message:'Synthetic message'};
  await assert.rejects(pushNotification({...context} as TenantContext,input),{code:'TENANT_AUTH_REQUIRED'});assert.equal(calls,0);
  assert.equal(await pushNotification(context,input),'saved-id');
  for(mode of ['foreign','missing','empty','outage'])assert.equal(await pushNotification(context,input),null);
  assert.equal(logs.length,4);assert.ok(logs.every(args=>args.length===1&&args[0]==='[NotificationService] insert receipt unavailable'));
});

test('shipped notification requires GitHub push even when other live flags are true',()=>{
  const result=buildCompletionNotification({projectName:'Synthetic',prompt:'fixture',githubPushConfirmed:false,
    fullyShipped:true,handoffReady:true,deployUrl:'https://example.invalid',deployVerified:true});
  assert.equal(result.type,'warning');assert.doesNotMatch(result.title,/shipped|ready/i);
});
