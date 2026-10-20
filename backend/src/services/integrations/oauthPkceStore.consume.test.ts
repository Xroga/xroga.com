import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { consumePkceSession, storePkceSession, clearPkceSession } from './oauthPkceStore.js';
import { createTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { exchangeVercelOAuthCode, buildVercelAuthorizeUrl, clearVercelConnection } from './vercelAuth.js';
import { exchangeSupabaseOAuthCode, buildSupabaseAuthorizeUrl, clearSupabaseOAuth } from './supabaseAuth.js';
import { completeCwsOAuth, startCwsOAuth } from '../publish/chromeWebStore.js';
import { sealRuntimeCredential } from './credentialVaultRuntime.js';
const context=createTenantContext({userId:'11111111-1111-4111-8111-111111111111',via:'remote_getuser'});

test('one-use OAuth admission fails closed on unavailable or malformed receipts and never uses Storage', async () => {
  const state='synthetic-state-0123456789';
  let body: unknown=null, status=200;
  const paths:string[]=[];
  const server=createServer(async(req,res)=>{
    paths.push(req.url!);
    let raw='';for await(const chunk of req)raw+=chunk;
    assert.deepEqual(JSON.parse(raw),{p_owner_id:context.userId,p_provider:'vercel_oauth_pkce',p_state:state});
    res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL=`http://127.0.0.1:${address.port}`;process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  try {
    const valid={state,verifier:'synthetic-verifier',redirect_uri:'https://example.invalid/callback',created_at:new Date().toISOString(),authorization_revision:'10000000-0000-4000-8000-000000000001'};
    const vault_revision='10000000-0000-4000-8000-000000000002';
    const envelope=await sealRuntimeCredential(context.userId,{provider:'vercel_oauth_pkce',account:'vercel_oauth_pkce',
      credentialType:'pkce-verifier',recordId:'vercel_oauth_pkce',revision:vault_revision,scope:'oauth-session'},valid.verifier);
    const receipt={...valid,verifier:envelope,vault_revision,vault_format:'pkce-v1'};
    for(body of [null,[],{},valid,{...receipt,state:'wrong'},{...receipt,verifier:''},{...receipt,nonce:{}},
      {...receipt,vault_revision:'10000000-0000-4000-8000-000000000003'},{...receipt,verifier:envelope+'bad'}])
      assert.equal(await consumePkceSession(context,'vercel_oauth_pkce',state),null);
    status=400;body={message:'PRIVATE_CANARY'};
    assert.equal(await consumePkceSession(context,'vercel_oauth_pkce',state),null);
    status=200;body=receipt;assert.deepEqual(await consumePkceSession(context,'vercel_oauth_pkce',state),valid);
    const count=paths.length;
    assert.equal(await consumePkceSession(context,'apikey_openai',state),null);
    assert.equal(await consumePkceSession(context,'vercel_oauth_pkce','short'),null);
    assert.equal(paths.length,count);assert.ok(paths.every(p=>p==='/rest/v1/rpc/consume_oauth_session'));
  } finally {
    for(const [key,value] of [['SUPABASE_URL',previous.url],['SUPABASE_SERVICE_ROLE_KEY',previous.key]])
      if(value===undefined)delete process.env[key!];else process.env[key!]=value;
    await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));
  }
});

test('all OAuth callback entry points reject invalid one-use state before external exchange',async()=>{
  const keys=['VERCEL_CLIENT_ID','VERCEL_CLIENT_SECRET','SUPABASE_OAUTH_CLIENT_ID','SUPABASE_OAUTH_CLIENT_SECRET'];
  const old=keys.map(k=>process.env[k]); keys.forEach(k=>process.env[k]='synthetic-only');
  const fetchOriginal=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('No outbound request authorized');};
  try {
    const opts={tenantContext:context,code:'synthetic',state:'short',redirectUri:'https://example.invalid/callback'};
    await assert.rejects(exchangeVercelOAuthCode(opts),/Invalid or expired/);
    await assert.rejects(exchangeSupabaseOAuthCode(opts),/Invalid or expired/);
    assert.equal((await completeCwsOAuth(opts)).ok,false);assert.equal(calls,0);
  } finally {globalThis.fetch=fetchOriginal;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});

test('session persistence and consumption reject raw, cloned or fabricated tenant authority before I/O',async(t)=>{
  const transport=t.mock.method(globalThis,'fetch',async()=>{throw new Error('Unexpected network');});
  const session={verifier:'fixture',state:'synthetic-state-0123456789',redirect_uri:'https://example.invalid/callback',created_at:new Date().toISOString()};
  for(const forged of [context.userId,{...context},JSON.parse(JSON.stringify(context)),{userId:context.userId},null]) {
    await assert.rejects(storePkceSession(forged as TenantContext,'supabase_oauth_pkce',session),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(consumePkceSession(forged as TenantContext,'supabase_oauth_pkce',session.state),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(clearPkceSession(forged as TenantContext,'supabase_oauth_pkce'),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(clearSupabaseOAuth(forged as TenantContext),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(clearVercelConnection(forged as TenantContext),{code:'TENANT_AUTH_REQUIRED'});
    const options={tenantContext:forged as TenantContext,code:'synthetic-code',state:session.state,redirectUri:session.redirect_uri};
    await assert.rejects(exchangeSupabaseOAuthCode(options),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(exchangeVercelOAuthCode(options),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(completeCwsOAuth(options),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(buildSupabaseAuthorizeUrl(forged as TenantContext,session.redirect_uri),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(buildVercelAuthorizeUrl(forged as TenantContext,session.redirect_uri),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(startCwsOAuth({...options,clientId:'synthetic-client',clientSecret:'synthetic-secret',extensionId:'synthetic-extension',publisherId:'synthetic-publisher'}),{code:'TENANT_AUTH_REQUIRED'});
  }
  for(const provider of ['apikey_openai','vercel','github','supabase_oauth','xroga_plugin_permission_policy','synthetic_pkce']) {
    await assert.rejects(storePkceSession(context,provider,session),/Unsupported OAuth session provider/);
    await assert.rejects(clearPkceSession(context,provider),/Unsupported OAuth session provider/);
    assert.equal(await consumePkceSession(context,provider,session.state),null);
  }
  assert.equal(transport.mock.callCount(),0);
});
