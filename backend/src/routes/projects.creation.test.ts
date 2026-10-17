import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { createTenantContext } from '../security/tenantContext.js';

test('project creation requires an owner-bound atomic receipt and strips client authority',async()=>{
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];const previous=names.map(name=>process.env[name]);
  process.env.SUPABASE_URL='http://127.0.0.1:49193';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
  const original=globalThis.fetch,owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
  const {default:router}=await import('./projects.js');
  const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as AuthRequest).tenantContext=createTenantContext({userId:owner,via:'local_jwt'});next();});app.use(router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
  let receipt:unknown={created:true,project:{id,user_id:owner,name:'Atomic',type:'app'}},fail=false,calls=0;
  globalThis.fetch=async(input,init)=>{
    const target=new URL(String(input instanceof Request?input.url:input));if(target.origin===base)return original(input,init);
    calls++;assert.equal(target.origin,process.env.SUPABASE_URL);assert.equal(target.pathname,'/rest/v1/rpc/save_owned_project_atomic');
    assert.deepEqual(JSON.parse(String(init?.body)),{p_owner_id:owner,p_project:{name:'Atomic',type:'app',user_prompt:'Keep this message'}});
    return fail?Response.json({message:'PRIVATE_TRANSACTION_DETAIL'},{status:400}):Response.json(receipt);
  };
  const save=()=>fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Atomic',type:'app',user_prompt:'Keep this message',user_id:id,tenantContext:{userId:id}})});
  try{
    assert.equal((await save()).status,201);
    receipt={created:false,project:{id,user_id:owner}};assert.equal((await save()).status,200);
    for(receipt of [null,{},[],{created:true,project:{id,user_id:id}},{created:'yes',project:{id,user_id:owner}},{created:true,project:{id:'invalid',user_id:owner}}])assert.equal((await save()).status,503);
    fail=true;const denied=await save();assert.equal(denied.status,503);assert.ok(!(await denied.text()).includes('PRIVATE_TRANSACTION_DETAIL'));
    const before=calls;assert.equal((await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'',type:'app'})})).status,400);assert.equal(calls,before);
  }finally{
    globalThis.fetch=original;names.forEach((name,index)=>previous[index]===undefined?delete process.env[name]:process.env[name]=previous[index]);
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
