import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { exchangeSupabaseOAuthCode, refreshSupabaseOAuthToken } from './supabaseAuth.js';
import { exchangeVercelOAuthCode, saveVercelConnection } from './vercelAuth.js';
import { loadProviderToken, storePkceSession, storeProviderToken } from './oauthPkceStore.js';
import { completeCwsOAuth } from '../publish/chromeWebStore.js';
import { createTenantContext } from '../../security/tenantContext.js';
import { sealRuntimeCredential, openRuntimeCredential } from './credentialVaultRuntime.js';
const context=createTenantContext({userId:'11111111-1111-4111-8111-111111111111',via:'remote_getuser'});

test('OAuth entry points carry consumed revisions across provider I/O and never upsert on a lost epoch',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_OAUTH_CLIENT_ID','SUPABASE_OAUTH_CLIENT_SECRET','VERCEL_CLIENT_ID','VERCEL_CLIENT_SECRET'];
  const previous=keys.map(key=>process.env[key]);keys.forEach(key=>process.env[key]='synthetic-only');
  process.env.SUPABASE_URL='http://127.0.0.1:49191';
  const original=globalThis.fetch,state=randomUUID(),revision=randomUUID();
  const requests:Array<{path:string;body:Record<string,unknown>}>=[];
  let allowSave=false,failConsume=false,providerCalls=0;
  let session: Record<string, unknown>;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));
    if(url.origin===process.env.SUPABASE_URL){
      const body=JSON.parse(String(init?.body??'{}'));requests.push({path:url.pathname,body});
      if(url.pathname.endsWith('/begin_oauth_session')){session=body.p_session;return Response.json(true);}
      if(url.pathname.endsWith('/consume_oauth_session'))return failConsume
        ?Response.json({message:'PRIVATE_DATABASE_CANARY'},{status:503})
        :Response.json({...session,state,authorization_revision:revision});
      if(url.pathname.endsWith('/save_oauth_connection'))return Response.json(allowSave);
      throw new Error(`Unexpected authority operation: ${url.pathname}`);
    }
    assert.ok(['api.supabase.com','api.vercel.com'].includes(url.hostname));providerCalls++;
    return Response.json({access_token:'SYNTHETIC_ACCESS',refresh_token:'SYNTHETIC_REFRESH',expires_in:3600});
  };
  try {
    await storePkceSession(context,'supabase_oauth_pkce',{verifier:'synthetic',state,redirect_uri:'https://example.invalid/callback',created_at:new Date().toISOString()});
    assert.equal(requests[0].path,'/rest/v1/rpc/begin_oauth_session');
    assert.equal(requests[0].body.p_owner_id,context.userId);
    const opts={tenantContext:context,state,code:'synthetic-code',redirectUri:'https://example.invalid/callback'};
    await assert.rejects(exchangeSupabaseOAuthCode(opts),/connection changed/);
    assert.equal(requests.at(-1)?.body.p_revision,revision);
    await storePkceSession(context,'vercel_oauth_pkce',{verifier:'synthetic',state,redirect_uri:opts.redirectUri,created_at:new Date().toISOString()});
    const exchanged=await exchangeVercelOAuthCode(opts);
    assert.ok(requests.filter(request=>request.path.endsWith('/consume_oauth_session')).every(request=>request.body.p_owner_id===context.userId));
    await assert.rejects(saveVercelConnection(context.userId,exchanged.access_token,{authKind:'sign_in_with_vercel'},undefined,exchanged.authorizationRevision),/connection changed/);
    assert.equal(requests.at(-1)?.body.p_revision,revision);
    const count=requests.length;
    await assert.rejects(storeProviderToken('owner','supabase_oauth',{access_token:'unadmitted'}),/revision required/);
    await assert.rejects(saveVercelConnection('owner','unadmitted',{authKind:'sign_in_with_vercel'}),/revision required/);
    assert.equal(requests.length,count);
    allowSave=true;await storePkceSession(context,'supabase_oauth_pkce',{verifier:'synthetic',state,redirect_uri:opts.redirectUri,created_at:new Date().toISOString()});await exchangeSupabaseOAuthCode(opts);
    assert.equal(requests.at(-1)?.path,'/rest/v1/rpc/save_oauth_connection');
    failConsume=true;const calls=providerCalls;
    await assert.rejects(exchangeSupabaseOAuthCode(opts),/Invalid or expired/);assert.equal(providerCalls,calls);
    assert.ok(requests.every(request=>request.path.startsWith('/rest/v1/rpc/')),'no Storage or unconditional REST upsert fallback');
  } finally {globalThis.fetch=original;keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});}
});

test('CWS carries the consumed epoch through encrypted BYOK admission and denies lost epochs before or after exchange',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','USER_SECRETS_ENCRYPTION_KEY'];
  const previous=keys.map(key=>process.env[key]);keys.forEach(key=>process.env[key]='synthetic-only');
  process.env.SUPABASE_URL='http://127.0.0.1:49191';
  const original=globalThis.fetch,revision=randomUUID(),state=randomUUID(),vaultRevision=randomUUID();
  const verifier=await sealRuntimeCredential(context.userId,{provider:'cws_oauth_pkce',account:'cws_oauth_pkce',credentialType:'pkce-verifier',recordId:'cws_oauth_pkce',revision:vaultRevision,scope:'oauth-session'},'SYNTHETIC_CLIENT_SECRET');
  let mismatch=true,allowSave=false,providerCalls=0;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));
    if(url.hostname==='oauth2.googleapis.com'){providerCalls++;return Response.json({refresh_token:'SYNTHETIC_GOOGLE_REFRESH'});}
    assert.equal(url.origin,process.env.SUPABASE_URL);
    if(url.pathname.endsWith('/consume_oauth_session'))return Response.json({verifier,state,vault_revision:vaultRevision,vault_format:'pkce-v1',
      redirect_uri:'https://xroga.com/dashboard/publish/cws/callback',created_at:new Date().toISOString(),authorization_revision:revision,
      nonce:JSON.stringify({clientId:'SYNTHETIC_CLIENT',extensionId:'synthetic-extension',publisherId:'synthetic-publisher'})});
    if(url.pathname.endsWith('/prepare_provider_key_write'))return Response.json(mismatch?randomUUID():revision);
    if(url.pathname.endsWith('/save_cws_oauth_key_if_current')){
      const body=JSON.parse(String(init?.body));assert.equal(body.p_revision,revision);assert.equal(body.p_provider,'apikey_cws_oauth');
      assert.ok(body.p_access_token.startsWith('vault:v3:'));assert.ok(!body.p_access_token.includes('SYNTHETIC_GOOGLE_REFRESH'));
      const plain=await openRuntimeCredential(context.userId,{provider:'cws_oauth',account:'apikey_cws_oauth',credentialType:body.p_metadata.type,recordId:'apikey_cws_oauth',revision:body.p_metadata.vault_revision,scope:'user-provider-key'},body.p_access_token);
      assert.match(plain,/SYNTHETIC_GOOGLE_REFRESH/);
      return Response.json(allowSave);
    }
    // Existing encrypted BYOK mirror is best effort after the conditional save.
    if(url.pathname.startsWith('/storage/'))return Response.json({message:'synthetic unavailable'},{status:400});
    throw new Error(`Unexpected persistence fallback: ${url.pathname}`);
  };
  try {
    const opts={tenantContext:context,code:'synthetic-code',state};
    await assert.rejects(completeCwsOAuth(opts),/changed during authorization/);assert.equal(providerCalls,0);
    mismatch=false;await assert.rejects(completeCwsOAuth(opts),/Credential changed while saving/);assert.equal(providerCalls,1);
    allowSave=true;assert.equal((await completeCwsOAuth(opts)).ok,true);assert.equal(providerCalls,2);
  } finally {globalThis.fetch=original;keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});}
});

test('Supabase refresh captures revision before exchange and absent authority cannot revive a mirror',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];const previous=keys.map(key=>process.env[key]);
  process.env.SUPABASE_URL='http://127.0.0.1:49191';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const original=globalThis.fetch,revision=randomUUID();let absent=false,providerCalls=0;
  const calls:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));calls.push(url.pathname);
    if(url.origin!==process.env.SUPABASE_URL){assert.equal(url.hostname,'api.supabase.com');providerCalls++;return Response.json({access_token:'LATE',refresh_token:'REUSED'});}
    if(url.pathname==='/rest/v1/user_integrations')return Response.json(absent?[]:[{access_token:'OLD',refresh_token:'REUSED',metadata:{},credential_revision:revision}]);
    if(url.pathname==='/rest/v1/rpc/save_oauth_connection'){
      const body=JSON.parse(String(init?.body));assert.equal(body.p_revision,revision);assert.equal(body.p_expected_refresh_token,'REUSED');return Response.json(false);
    }
    throw new Error('No legacy Storage access authorized');
  };
  try {
    await assert.rejects(refreshSupabaseOAuthToken(context.userId,'REUSED'),/connection changed/);
    assert.equal(providerCalls,1);absent=true;
    assert.equal(await loadProviderToken(context.userId,'supabase_oauth'),null);
    await assert.rejects(refreshSupabaseOAuthToken(context.userId,'REUSED'),/changed before refresh/);
    assert.equal(providerCalls,1);assert.ok(calls.every(path=>!path.includes('/storage/')));
  } finally {globalThis.fetch=original;keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});}
});
