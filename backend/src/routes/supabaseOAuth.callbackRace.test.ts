import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import router from './supabaseOAuth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { createTenantContext } from '../security/tenantContext.js';
import { sealRuntimeCredential } from '../services/integrations/credentialVaultRuntime.js';

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
  let oauthMetadata:Record<string,unknown>={},oauthRevision=randomUUID();
  const state=Buffer.from(JSON.stringify({userId:owner})).toString('base64url');
  const pkceVaultRevision=randomUUID();
  const pkceEnvelope=await sealRuntimeCredential(owner,{provider:'supabase_oauth_pkce',account:'supabase_oauth_pkce',
    credentialType:'pkce-verifier',recordId:'supabase_oauth_pkce',revision:pkceVaultRevision,scope:'oauth-session'},'synthetic-verifier');
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
        assert.equal(prepares,1,'Independent PAT admission precedes exchange, bundle snapshot does not mutate');
        reply({state,verifier:pkceEnvelope,redirect_uri:'http://localhost:3000/dashboard/integrations/supabase/callback',
          created_at:new Date().toISOString(),authorization_revision:randomUUID(),vault_revision:pkceVaultRevision,vault_format:'pkce-v1'});
      } else if(url.pathname.endsWith('/save_oauth_connection')) {
        oauthToken=body.p_access_token;oauthMetadata=body.p_metadata;oauthRevision=randomUUID();reply(true);
      } else if(url.pathname.endsWith('/save_provider_key_if_current')) {
        assert.equal(body.p_owner_id,owner);
        attempted.push(body.p_provider);
        const accepted=body.p_revision===revisions.get(body.p_provider);
        if(accepted){saved.push(body.p_provider);revisions.set(body.p_provider,randomUUID());}
        reply(accepted);
      } else if(url.pathname.endsWith('/save_supabase_bundle_if_current')) {
        attempted.push('bundle');
        const accepted=body.p_rows.every((row:{provider:string;revision:string|null})=>(revisions.get(row.provider)??null)===row.revision);
        if(accepted)saved.push('bundle');reply(accepted);
      } else if(url.pathname.endsWith('/revoke_provider_key')) {
        revisions.set(body.p_provider,randomUUID());reply(true);
      } else if(url.pathname==='/rest/v1/user_integrations') {
        if(req.method==='POST'){oauthToken='';reply([]);}
        else if(url.searchParams.get('provider')==='eq.supabase_oauth')reply(oauthToken?[{user_id:owner,provider:'supabase_oauth',access_token:oauthToken,refresh_token:null,metadata:oauthMetadata,credential_revision:oauthRevision}]:[]);
        else if(url.searchParams.get('provider')?.startsWith('in.'))reply([...revisions].filter(([p])=>['apikey_supabase_url','apikey_supabase_anon','apikey_supabase','apikey_supabase_db_password'].includes(p)).map(([p,r])=>({user_id:owner,provider:p,access_token:'',metadata:{revoked:true},credential_revision:r})));
        else reply([]);
      } else if(url.pathname==='/storage/v1/bucket')reply([{id:'xroga-github-tokens',public:false}]);
      else if(url.pathname.startsWith('/storage/')&&req.method==='GET'){res.statusCode=404;reply({statusCode:'404',message:'Not found'});}
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
          assert.equal(prepares,1,'Bundle snapshot and PAT admission precede project creation');
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
      assert.equal(prepares,1,'No post-disconnect re-admission');
      assert.equal(oauthToken,'');
    }
    disconnect=false;projectCount=2;revisions.clear();saved.length=0;prepares=0;
    const success=await originalFetch(`${origin}/connect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'synthetic-code',state})});
    assert.equal(success.status,200);assert.deepEqual(saved,['apikey_supabase_pat']);assert.equal(prepares,1);
    revisions.clear();saved.length=0;prepares=0;selectRace=true;
    const selected=await originalFetch(`${origin}/select-project`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({projectRef:'fixtureproject0'})});
    assert.ok([400,403].includes(selected.status));assert.equal(selectRace,false);
    assert.deepEqual(saved,[]);assert.equal(prepares,1);assert.equal(oauthToken,'');
    revisions.clear();saved.length=0;attempted.length=0;prepares=0;oauthToken='SYNTHETIC_CURRENT_TOKEN';
    const created=await originalFetch(`${origin}/create-project`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'Fixture',organizationId:'synthetic-org',userId:'22222222-2222-4222-8222-222222222222'})});
    assert.equal(created.status,400);assert.equal(createdProjects,0,'A raw creation request cannot bypass native exact approval');
    assert.deepEqual(attempted,[],'No implicit derived-credential persistence');
    assert.deepEqual(saved,[]);assert.equal(prepares,0);assert.equal(oauthToken,'SYNTHETIC_CURRENT_TOKEN','Rejected creation does not replace the current connection');
    await new Promise<void>(resolve=>setTimeout(resolve,50));
  } finally {
    globalThis.fetch=originalFetch;
    for(const [name,value]of before){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await Promise.all([close(api),close(database)]);
  }
});
