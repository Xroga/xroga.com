import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type {AuthRequest} from '../middleware/auth.js';
import {createTenantContext} from '../security/tenantContext.js';

test('project file reads recheck owner in the child query and deny inconsistent joined receipts',async()=>{
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=names.map(name=>process.env[name]);
  process.env.SUPABASE_URL='http://127.0.0.1:49192';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
  const original=globalThis.fetch,owner='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',file='33333333-3333-4333-8333-333333333333';
  const {default:router}=await import('./projects.js');const app=express();
  app.use((req,_res,next)=>{(req as AuthRequest).tenantContext=createTenantContext({userId:owner,via:'local_jwt'});next();});app.use(router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
  let mode='own',childReads=0;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));if(url.origin===base)return original(input,init);
    assert.equal(url.origin,process.env.SUPABASE_URL);
    if(url.pathname.endsWith('/projects')){
      assert.equal(url.searchParams.get('id'),`eq.${project}`);assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
      if(mode==='outage')return Response.json({message:'PRIVATE_AUTHORITY_ERROR'},{status:503});
      return Response.json(mode==='missing'?[]:[{id:project,github_repo_name:'fixture/repo'}]);
    }
    assert.equal(url.pathname,'/rest/v1/project_files');childReads++;
    assert.equal(url.searchParams.get('project_id'),`eq.${project}`);assert.equal(url.searchParams.get('projects.user_id'),`eq.${owner}`);
    assert.match(url.searchParams.get('select')!,/projects!inner\(user_id\)/);
    if(mode==='changed-owner')return Response.json([]);
    return Response.json([{id:file,project_id:mode==='bad-project'?file:project,file_name:'fixture.ts',content:'PRIVATE_FILE_CANARY',projects:{user_id:mode==='bad-owner'?project:owner}}]);
  };
  try{
    for(const path of ['files','code']){
      mode='own';const positive=await fetch(`${base}/${project}/${path}`);assert.equal(positive.status,200);const text=await positive.text();assert.match(text,/PRIVATE_FILE_CANARY/);assert.ok(!text.includes('user_id'));
      for(mode of ['bad-owner','bad-project']){const denied=await fetch(`${base}/${project}/${path}`);assert.equal(denied.status,503);assert.ok(!(await denied.text()).includes('PRIVATE_FILE_CANARY'));}
      mode='changed-owner';const changed=await fetch(`${base}/${project}/${path}`);assert.equal(changed.status,200);assert.ok(!(await changed.text()).includes('PRIVATE_FILE_CANARY'));
      for(mode of ['outage','missing']){const before=childReads;const denied=await fetch(`${base}/${project}/${path}`);assert.equal(denied.status,mode==='outage'?503:404);assert.equal(childReads,before);assert.ok(!(await denied.text()).includes('PRIVATE_AUTHORITY_ERROR'));}
    }
  }finally{
    globalThis.fetch=original;names.forEach((name,index)=>previous[index]===undefined?delete process.env[name]:process.env[name]=previous[index]);
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
