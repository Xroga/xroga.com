import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {refreshVercelOAuthToken,getVercelToken} from './vercelAuth.js';
import {sealRuntimeCredential} from './credentialVaultRuntime.js';

test('Vercel native refresh retains the exact canonical provider account with its original revision',async()=>{
  const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,id:process.env.VERCEL_CLIENT_ID,secret:process.env.VERCEL_CLIENT_SECRET};
  process.env.SUPABASE_URL='http://127.0.0.1:49238';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';process.env.VERCEL_CLIENT_ID='synthetic-client';process.env.VERCEL_CLIENT_SECRET='synthetic-secret';
  const original=globalThis.fetch,owner=randomUUID(),revision=randomUUID(),account='synthetic-current-vercel-account';
  const vaultRevision=randomUUID();
  const envelope=await sealRuntimeCredential(owner,{provider:'vercel',account:'vercel',credentialType:'oauth-token',
    recordId:'vercel',revision:vaultRevision,scope:'oauth-connection'},
    JSON.stringify({access_token:'synthetic-old-access',refresh_token:'synthetic-current-refresh'}));
  let lease:string|null=null,providerCalls=0;
  let saved:Record<string,unknown>|undefined;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));
    if(url.origin==='https://api.vercel.com'){
      providerCalls++;
      assert.equal(url.pathname,'/login/oauth/token');assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'),'synthetic-current-refresh');
      return Response.json({access_token:'synthetic-new-access',refresh_token:'synthetic-new-refresh',expires_in:3600});
    }
    assert.equal(url.origin,process.env.SUPABASE_URL);
    if(url.pathname==='/rest/v1/user_integrations'){
      assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);assert.equal(url.searchParams.get('provider'),'eq.vercel');
      return Response.json([{user_id:owner,provider:'vercel',provider_user_id:account,access_token:envelope,refresh_token:lease,
        credential_revision:revision,metadata:{username:'synthetic-user',vault_revision:vaultRevision,vault_format:'oauth-v1'}}]);
    }
    assert.equal(url.pathname,'/rest/v1/rpc/save_oauth_connection');saved=JSON.parse(String(init?.body));return Response.json(true);
  };
  try{
    assert.equal(await refreshVercelOAuthToken(owner,'synthetic-current-refresh','synthetic-user'),'synthetic-new-access');
    assert.equal(saved?.p_owner_id,owner);assert.equal(saved?.p_provider,'vercel');assert.equal(saved?.p_revision,revision);
    assert.equal(saved?.p_expected_refresh_token,'synthetic-current-refresh');assert.equal(saved?.p_provider_user_id,account);
    lease='xroga-refresh-lease:synthetic-owned-marker';
    assert.equal(await refreshVercelOAuthToken(owner,'synthetic-current-refresh','synthetic-user',lease,revision),'synthetic-new-access');
    assert.equal(saved?.p_expected_refresh_token,lease);assert.equal(saved?.p_provider_user_id,account);
    const calls=providerCalls;
    await assert.rejects(refreshVercelOAuthToken(owner,'synthetic-current-refresh','synthetic-user',lease,randomUUID()),/connection changed before refresh/);
    await assert.rejects(refreshVercelOAuthToken(owner,'synthetic-current-refresh','synthetic-user','different-lease',revision),/connection changed before refresh/);
    assert.equal(providerCalls,calls);
    let reads=0;
    const winnerRevision=randomUUID(),winnerVaultRevision=randomUUID();
    const winnerEnvelope=await sealRuntimeCredential(owner,{provider:'vercel',account:'vercel',credentialType:'oauth-token',
      recordId:'vercel',revision:winnerVaultRevision,scope:'oauth-connection'},
      JSON.stringify({access_token:'synthetic-winner-access',refresh_token:'synthetic-new-refresh'}));
    globalThis.fetch=async input=>{
      const url=new URL(String(input instanceof Request?input.url:input));assert.equal(url.origin,process.env.SUPABASE_URL);
      const winner=reads++>0;
      return Response.json([{user_id:owner,provider:'vercel',provider_user_id:account,access_token:winner?winnerEnvelope:envelope,
        refresh_token:null,credential_revision:winner?winnerRevision:revision,
        metadata:{vault_revision:winner?winnerVaultRevision:vaultRevision,vault_format:'oauth-v1',expires_at:new Date(Date.now()+3600000).toISOString()}}]);
    };
    assert.equal(await getVercelToken(owner),'synthetic-winner-access');assert.equal(reads,4);
  }finally{
    globalThis.fetch=original;
    if(previous.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previous.url;
    if(previous.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous.key;
    if(previous.id===undefined)delete process.env.VERCEL_CLIENT_ID;else process.env.VERCEL_CLIENT_ID=previous.id;
    if(previous.secret===undefined)delete process.env.VERCEL_CLIENT_SECRET;else process.env.VERCEL_CLIENT_SECRET=previous.secret;
  }
});
