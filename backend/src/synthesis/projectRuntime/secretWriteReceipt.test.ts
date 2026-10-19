import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SupabaseProjectRuntimeStore} from './store.js';

test('runtime secret mutations require exact owner project key and envelope receipts without exposing database errors',async()=>{
  const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='http://127.0.0.1:49234';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
  const now=new Date().toISOString(),encryptedValue=`v1:${Buffer.alloc(12).toString('base64')}:${Buffer.alloc(16).toString('base64')}:YQ==`;
  const record={userId:'owner',projectId:'logical-project',name:'API_TOKEN',scope:'preview' as const,encryptedValue,keyVersion:1,createdAt:now,updatedAt:now};
  const row={user_id:record.userId,project_id:record.projectId,name:record.name,scope:record.scope,encrypted_value:encryptedValue,key_version:1,created_at:now,updated_at:now};
  let response:unknown=[row],failure=false;
  try{
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input));assert.equal(url.pathname,'/rest/v1/project_runtime_secrets');
      if(init?.method==='DELETE')for(const [key,value]of Object.entries({user_id:'owner',project_id:'logical-project',name:'API_TOKEN',scope:'preview'}))assert.equal(url.searchParams.get(key),`eq.${value}`);
      else assert.equal(url.searchParams.get('on_conflict'),'user_id,project_id,name,scope');
      const body=init?.method==='POST'&&Array.isArray(response)?response[0]??null:response;
      return failure?Response.json({message:'PRIVATE_DATABASE_CANARY',code:'42501'},{status:403}):Response.json(body);
    };
    const store=new SupabaseProjectRuntimeStore();
    // Foreign receipts must never be accepted even when the transport reports success.
    response=[{...row,user_id:'other'}];
    await assert.rejects(store.saveEncryptedSecret(record),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    await assert.rejects(store.deleteEncryptedSecret(record),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    for(const mutation of [{project_id:'other'},{name:'OTHER_TOKEN'},{scope:'shared'},{encrypted_value:encryptedValue.replace('YQ==','Yg==')},{key_version:2}]){
      response=[{...row,...mutation}];await assert.rejects(store.saveEncryptedSecret(record),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    }
    response=[];await assert.rejects(store.saveEncryptedSecret(record),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    await store.deleteEncryptedSecret(record); // An already absent owned key is an idempotent delete.
    response=[row];await store.saveEncryptedSecret(record);await store.deleteEncryptedSecret(record);
    response=[row,row];await assert.rejects(store.deleteEncryptedSecret(record),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    response=[null];await assert.rejects(store.deleteEncryptedSecret(record),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    failure=true;
    for(const operation of [()=>store.saveEncryptedSecret(record),()=>store.deleteEncryptedSecret(record)])await assert.rejects(operation(),error=>{
      assert.equal((error as {code:string}).code,'RESOURCE_ACCESS_UNAVAILABLE');assert.ok(!JSON.stringify(error).includes('PRIVATE_DATABASE_CANARY'));return true;
    });
  }finally{
    globalThis.fetch=oldFetch;
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  }
});
