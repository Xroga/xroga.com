import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import publishRouter from '../../routes/publish.js';
import type {AuthRequest} from '../../middleware/auth.js';
import {createTenantContext} from '../../security/tenantContext.js';
import {nativeReleaseFixture}from'./__tests__/nativeReleaseFixture.js';
import{createHash}from'node:crypto';

test('EAS publish HTTP route preserves explicit project and blocks submit after required sync failure',async t=>{
  const context=createTenantContext({userId:'11111111-1111-4111-8111-111111111111',via:'remote_getuser'});
  const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as AuthRequest).userId=context.userId;(req as AuthRequest).tenantContext=context;next();});app.use(publishRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NODE_ENV'],before=names.map(n=>process.env[n]);process.env.NODE_ENV='test';
  process.env.SUPABASE_URL='https://route-eas-fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
  t.after(()=>names.forEach((n,i)=>{if(before[i]===undefined)delete process.env[n];else process.env[n]=before[i];}));
  const fixture=nativeReleaseFixture(context.userId),sha='a'.repeat(40),workflow='jobs:\n  build:\n    type: build\n';
  const request=globalThis.fetch;let dispatches=0,queries=0,owned=false;const providers:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.origin==='https://route-eas-fixture.invalid'){
      const handled=await fixture.database(url,init);if(handled)return handled;
      if(url.pathname.endsWith('/production_audit_log')){const row=JSON.parse(String(init?.body));assert.equal(row.user_id,context.userId);assert.equal(row.outcome,'DENY');assert.doesNotMatch(String(init?.body),/BEGIN PRIVATE KEY|expo-fixture/);return Response.json(row);}
      if(url.pathname.endsWith('/github_integrations') || url.searchParams.get('provider') === 'eq.github')return Response.json({user_id:context.userId,provider:'github',access_token:'github-fixture',credential_revision:null,metadata:{}});
      const provider=url.searchParams.get('provider')?.slice(3)??'';providers.push(provider);
      const value=provider==='apikey_expo'?'expo-fixture':provider==='apikey_google_play'?JSON.stringify({private_key:'private'}):JSON.stringify({keyId:'key',issuerId:'issuer',keyP8:'BEGIN PRIVATE KEY private'});
      return Response.json({user_id:'11111111-1111-4111-8111-111111111111',provider,credential_revision:null,access_token:`enc:${Buffer.from(`fixture:${value}`).toString('base64')}`,metadata:{}});
    }
    if(url.origin==='https://api.github.com'){
      const size=Buffer.byteLength(workflow),blob=createHash('sha1').update(`blob ${size}\0`).update(workflow).digest('hex'),tree='c'.repeat(40);
      if(url.pathname.includes('/git/commits/'))return Response.json({sha,tree:{sha:tree}});
      if(url.pathname.includes('/git/trees/'))return Response.json({sha:tree,truncated:false,tree:[{path:'.eas/workflows/build-android.yml',type:'blob',mode:'100644',sha:blob,size}]});
      if(url.pathname.includes('/git/blobs/'))return Response.json({sha:blob,encoding:'base64',size,content:Buffer.from(workflow).toString('base64')});
      return Response.json(url.pathname.includes('/commits/')?{sha}:{type:'file',name:'build-android.yml',path:'.eas/workflows/build-android.yml',encoding:'base64',size,content:Buffer.from(workflow).toString('base64')});
    }
    assert.equal(url.origin,'https://api.expo.dev');const body=JSON.parse(String(init?.body));
    if(url.pathname==='/graphql'){
      queries++;
      if(body.query.includes('XrogaExpoAccountsAdmission'))return Response.json({data:{me:{accounts:[{id:'account',name:'account'}]}}});
      assert.equal(body.variables.appId,'explicit-project');
      const byId={id:owned?'explicit-project':'wrong-project',slug:'fixture',name:'fixture',ownerAccount:{id:'account',name:'account'},githubRepository:{metadata:{githubRepoOwnerName:'Owner',githubRepoName:'repo'}}};
      return Response.json({data:{app:{byId}}});
    }
    assert.equal(url.pathname,'/v2/workflows/dispatch');assert.equal(body.appId,'explicit-project');dispatches++;return Response.json({data:{id:'run-fixture'}});
  });
  for(const platform of ['android','ios']){
    providers.length=0;
    const result=await request(`http://127.0.0.1:${address.port}/eas-publish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform,projectId:'explicit-project',submit:true})});
    assert.equal(result.status,403);assert.equal(dispatches,0);
    assert.equal(providers.includes(platform==='android'?'apikey_apple_asc_api':'apikey_google_play'),false);
  }
  const beforeQueries=queries;owned=true;
  const result=await request(`http://127.0.0.1:${address.port}/eas-publish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:'android',projectId:'explicit-project',submit:false})});
  assert.equal(result.status,202);const prepared=await result.json() as{needsConfirmation?:boolean;reviewUrl?:string};assert.equal(prepared.needsConfirmation,true);assert.match(prepared.reviewUrl??'',/^\/dashboard\/actions\/confirm\//);assert.equal(dispatches,0);assert.ok(queries>beforeQueries);
});
