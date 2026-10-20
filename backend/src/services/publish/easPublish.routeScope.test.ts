import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import publishRouter from '../../routes/publish.js';
import type {AuthRequest} from '../../middleware/auth.js';

test('EAS publish HTTP route preserves explicit project and blocks submit after required sync failure',async t=>{
  const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as AuthRequest).userId='11111111-1111-4111-8111-111111111111';next();});app.use(publishRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],before=names.map(n=>process.env[n]);
  process.env.SUPABASE_URL='https://route-eas-fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
  t.after(()=>names.forEach((n,i)=>{if(before[i]===undefined)delete process.env[n];else process.env[n]=before[i];}));
  const request=globalThis.fetch;let dispatches=0,queries=0;const providers:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.origin==='https://route-eas-fixture.invalid'){
      if(url.pathname.endsWith('/github_integrations') || url.searchParams.get('provider') === 'eq.github')return Response.json({access_token:'github-fixture'});
      const provider=url.searchParams.get('provider')?.slice(3)??'';providers.push(provider);
      const value=provider==='apikey_expo'?'expo-fixture':provider==='apikey_google_play'?JSON.stringify({private_key:'private'}):JSON.stringify({keyId:'key',issuerId:'issuer',keyP8:'BEGIN PRIVATE KEY private'});
      return Response.json({user_id:'11111111-1111-4111-8111-111111111111',provider,credential_revision:null,access_token:`enc:${Buffer.from(`fixture:${value}`).toString('base64')}`,metadata:{}});
    }
    assert.equal(url.origin,'https://api.expo.dev');const body=JSON.parse(String(init?.body));
    if(url.pathname==='/graphql'){queries++;assert.equal(body.variables.appId,'explicit-project');return Response.json({data:{app:{byId:{id:'wrong-project',ownerAccount:{id:'account'}}}}});}
    assert.equal(url.pathname,'/v2/workflows/dispatch');assert.equal(body.appId,'explicit-project');dispatches++;return Response.json({data:{id:'run-fixture'}});
  });
  for(const platform of ['android','ios']){
    providers.length=0;
    const result=await request(`http://127.0.0.1:${address.port}/eas-publish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform,projectId:'explicit-project',submit:true})});
    assert.equal(result.status,400);assert.equal(dispatches,0);
    assert.equal(providers.includes(platform==='android'?'apikey_apple_asc_api':'apikey_google_play'),false);
  }
  const beforeQueries=queries;
  const result=await request(`http://127.0.0.1:${address.port}/eas-publish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:'android',projectId:'explicit-project',submit:false})});
  assert.equal(result.status,200);assert.equal(dispatches,1);assert.equal(queries,beforeQueries);
});
