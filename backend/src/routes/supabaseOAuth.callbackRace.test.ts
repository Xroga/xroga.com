import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import router from './supabaseOAuth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { createTenantContext } from '../security/tenantContext.js';

const owner='11111111-1111-4111-8111-111111111111';
async function listen(server:Server) {
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  return `http://127.0.0.1:${address.port}`;
}
const close=(server:Server)=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));

test('Supabase callback cannot resurrect derived keys after disconnect during project discovery',async()=>{
  const revisions=new Map<string,string>();
  const saved:string[]=[];
  const attempted:string[]=[];
  let createdProjects=0;
  let prepares=0,disconnect=true,projectCount=1,oauthToken='',selectRace=false;
  const state=Buffer.from(JSON.stringify({userId:owner})).toString('base64url');
  const database=createServer((req,res)=>{
    let raw='';req.on('data',chunk=>{raw+=chunk;});req.on('end',()=>{
      const url=new URL(req.url!,'http://fixture'),body=raw?JSON.parse(raw):{};
      res.setHeader('Content-Type','application/json');
      const reply=(value:unknown)=>res.end(JSON.stringify(value));
      if(url.pathname.endsWith('/prepare_provider_key_write')) {
        prepares++;assert.equal(body.p_owner_id,owner);
        if(!revisions.has(body.p_provider))revisions.set(body.p_provider,randomUUID());
        reply(revisions.get(body.p_provider));
      } else if(url.pathname.endsWith('/consume_oauth_session')) {
        assert.equal(prepares,4,'All derived-key admissions precede exchange');
        reply({state,verifier:'synthetic-verifier',redirect_uri:'http://localhost:3000/dashboard/integrations/supabase/callback',
          created_at:new Date().toISOString(),authorization_revision:randomUUID()});
      } else if(url.pathname.endsWith('/save_oauth_connection')) {
        oauthToken=body.p_access_token;reply(true);
      } else if(url.pathname.endsWith('/save_provider_key_if_current')) {
        assert.equal(body.p_owner_id,owner);
        attempted.push(body.p_provider);
        const accepted=body.p_revision===revisions.get(body.p_provider);
        if(accepted){saved.push(body.p_provider);revisions.set(body.p_provider,randomUUID());}
        reply(accepted);
      } else if(url.pathname.endsWith('/revoke_provider_key')) {
        revisions.set(body.p_provider,randomUUID());reply(true);
      } else if(url.pathname==='/rest/v1/user_integrations') {
        if(req.method==='POST'){oauthToken='';reply([]);}
        else if(url.searchParams.get('provider')==='eq.supabase_oauth')reply(oauthToken?[{access_token:oauthToken,metadata:{}}]:[]);
        else reply([]);
      } else if(url.pathname==='/storage/v1/bucket')reply([{id:'xroga-github-tokens',public:false}]);
      else if(url.pathname.startsWith('/storage/'))reply([]);
      else {res.statusCode=500;reply({message:'Unexpected fixture request'});}
    });
  });
  const app=express();app.use(express.json());
  app.use((req:AuthRequest,_res,next)=>{req.userId=owner;req.tenantContext=createTenantContext({userId:owner,via:'remote_getuser'});next();});app.use(router);
  const api=createServer(app);
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_OAUTH_CLIENT_ID','SUPABASE_OAUTH_CLIENT_SECRET',
    'USER_SECRETS_ENCRYPTION_KEY','DATABASE_URL','SUPABASE_DB_URL','SUPABASE_DB_PASSWORD'];
  const before=new Map(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  try {
    for(const name of names)delete process.env[name];
    process.env.SUPABASE_URL=await listen(database);
    process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-loopback-only';
    process.env.SUPABASE_OAUTH_CLIENT_ID='synthetic-client';
    process.env.SUPABASE_OAUTH_CLIENT_SECRET='synthetic-secret';
    process.env.USER_SECRETS_ENCRYPTION_KEY='synthetic-test-encryption-only';
    const origin=await listen(api);
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input instanceof Request?input.url:input));
      if(url.hostname==='127.0.0.1') {
        if(selectRace && url.pathname==='/rest/v1/user_integrations' && url.searchParams.get('provider')==='eq.supabase_oauth') {
          selectRace=false;
          const response=await originalFetch(input,init);
          // The caller has a successful pre-disconnect response buffered.
          const body=await response.json();
          assert.equal((await originalFetch(`${origin}/disconnect`,{method:'DELETE'})).status,200);
          return Response.json(body);
        }
        return originalFetch(input,init);
      }
      assert.equal(url.origin,'https://api.supabase.com','No other provider may be contacted');
      if(url.pathname==='/v1/oauth/token')return Response.json({access_token:'SYNTHETIC_OAUTH_TOKEN'});
      if(url.pathname==='/v1/projects') {
        if(init?.method==='POST') {
          assert.equal(prepares,5,'All five derived-key admissions precede project creation');
          createdProjects++;
          assert.equal((await originalFetch(`${origin}/disconnect`,{method:'DELETE'})).status,200);
          return Response.json({id:'fixtureproject0'});
        }
        if(disconnect)assert.equal((await originalFetch(`${origin}/disconnect`,{method:'DELETE'})).status,200);
        return Response.json(Array.from({length:projectCount},(_,i)=>({id:`fixtureproject${i}`,name:`Fixture ${i}`})));
      }
      assert.equal(url.pathname,'/v1/projects/fixtureproject0/api-keys');
      return Response.json([{name:'anon',api_key:'SYNTHETIC_ANON_KEY'},{name:'service_role',api_key:'SYNTHETIC_SERVICE_KEY'}]);
    };
    for(projectCount of [0,1,2]) {
      revisions.clear();saved.length=0;prepares=0;
      const response=await originalFetch(`${origin}/connect`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code:'synthetic-code',state,userId:'22222222-2222-4222-8222-222222222222'})});
      assert.ok([400,409].includes(response.status),`project count ${projectCount}`);
      assert.deepEqual(saved,[],'Disconnected callback cannot restore any derived credential');
      assert.equal(prepares,4,'No post-disconnect re-admission');
      assert.equal(oauthToken,'');
    }
    disconnect=false;projectCount=2;revisions.clear();saved.length=0;prepares=0;
    const success=await originalFetch(`${origin}/connect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'synthetic-code',state})});
    assert.equal(success.status,200);assert.deepEqual(saved,['apikey_supabase_pat']);assert.equal(prepares,4);
    revisions.clear();saved.length=0;prepares=0;selectRace=true;
    const selected=await originalFetch(`${origin}/select-project`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({projectRef:'fixtureproject0'})});
    assert.equal(selected.status,400);assert.equal(selectRace,false);
    assert.deepEqual(saved,[]);assert.equal(prepares,4);assert.equal(oauthToken,'');
    revisions.clear();saved.length=0;attempted.length=0;prepares=0;oauthToken='SYNTHETIC_CURRENT_TOKEN';
    const created=await originalFetch(`${origin}/create-project`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'Fixture',organizationId:'synthetic-org',userId:'22222222-2222-4222-8222-222222222222'})});
    assert.equal(created.status,400);assert.equal(createdProjects,1);
    assert.deepEqual(attempted,['apikey_supabase_db_password']);
    assert.deepEqual(saved,[]);assert.equal(prepares,5);assert.equal(oauthToken,'');
    await new Promise<void>(resolve=>setTimeout(resolve,50));
  } finally {
    globalThis.fetch=originalFetch;
    for(const [name,value]of before){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await Promise.all([close(api),close(database)]);
  }
});
