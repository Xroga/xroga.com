import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {loadProviderToken} from './oauthPkceStore.js';
import {sealRuntimeCredential} from './credentialVaultRuntime.js';

test('OAuth vault revalidation accepts only lease coordination changes and keeps credential account revision and revocation fences',async()=>{
  const names=['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=names.map(name=>process.env[name]);
  process.env.NODE_ENV='test';process.env.SUPABASE_URL='http://127.0.0.1:49239';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
  const original=globalThis.fetch,owner=randomUUID(),revision=randomUUID(),vaultRevision=randomUUID();
  try{
    const envelope=await sealRuntimeCredential(owner,{provider:'vercel',account:'vercel',credentialType:'oauth-token',
      recordId:'vercel',revision:vaultRevision,scope:'oauth-connection'},JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh'}));
    const row={user_id:owner,provider:'vercel',provider_user_id:'synthetic-account',access_token:envelope,
      refresh_token:null as string|null,credential_revision:revision,metadata:{vault_revision:vaultRevision,vault_format:'oauth-v1'}};
    for(const [first,next]of [[null,'xroga-refresh-lease:synthetic'],['xroga-refresh-lease:synthetic',null]] as const){
      let reads=0;
      globalThis.fetch=async input=>{const url=new URL(String(input instanceof Request?input.url:input));
        assert.equal(url.hostname,'127.0.0.1');assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
        return Response.json([{...row,refresh_token:reads++===0?first:next}]);};
      const result=await loadProviderToken(owner,'vercel',{authoritativeOnly:true});
      assert.equal(result?.access_token,'synthetic-access');assert.equal(result?.refresh_token,'synthetic-refresh');
      assert.equal(result?.metadata?.refresh_lease_marker,next??undefined);assert.equal(reads,2);
    }
    for(const mutation of [{credential_revision:randomUUID()},{provider_user_id:'other-account'},
      {access_token:'vault:v3:substitution'},{refresh_token:'raw-refresh-substitution'},
      {metadata:{...row.metadata,revoked:true}}]){
      let reads=0;
      globalThis.fetch=async()=>Response.json([reads++===0?row:{...row,...mutation}]);
      assert.equal(await loadProviderToken(owner,'vercel',{authoritativeOnly:true}),null);
    }
  }finally{globalThis.fetch=original;names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];});}
});
