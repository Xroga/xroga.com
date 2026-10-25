import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import type {AuthRequest} from '../middleware/auth.js';
import {createTenantContext} from '../security/tenantContext.js';

test('project collection and detail keep database outages distinct from absent ownership',async()=>{
 const previous=[process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY],original=globalThis.fetch;
 process.env.SUPABASE_URL='http://127.0.0.1:49192';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
 const owner='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';
 const {default:router}=await import('./projects.js'),app=express();
 app.use((req,_res,next)=>{(req as AuthRequest).tenantContext=createTenantContext({userId:owner,via:'local_jwt'});next();});app.use(router);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 let mode='own';
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input instanceof Request?input.url:input));if(url.origin===base)return original(input,init);
  assert.equal(url.origin,process.env.SUPABASE_URL);assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
  if(mode==='outage')return Response.json({message:'PRIVATE_DATABASE_DIAGNOSTIC'},{status:503});
  return Response.json(mode==='missing'?[]:[{id:project,user_id:owner,project_files:[],project_messages:[]}]);
 };
 try{
  for(const path of ['/',`/${project}`]){
   mode='own';const own=await fetch(`${base}${path}?userId=forged`);assert.equal(own.status,200);assert.ok((await own.text()).includes(project));
   mode='outage';const unavailable=await fetch(`${base}${path}`);assert.equal(unavailable.status,503);assert.ok(!(await unavailable.text()).includes('PRIVATE_DATABASE_DIAGNOSTIC'));
  }
  mode='missing';assert.equal((await fetch(`${base}/${project}`)).status,404);
 }finally{
  globalThis.fetch=original;
  for(const [index,key]of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].entries())previous[index]===undefined?delete process.env[key]:process.env[key]=previous[index];
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
