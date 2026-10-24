import assert from 'node:assert/strict';
import { createCipheriv, scryptSync } from 'node:crypto';
import test from 'node:test';
import { getUserProviderKey, resolveProviderEnvForDeploy } from './userProviderKeys.js';

test('credential reads reject malformed envelopes and deploy classification follows the authoritative provider row', async () => {
  const owner='11111111-1111-4111-8111-111111111111',secret='SYNTHETIC_SECRET_CANARY',key='synthetic-integrity-fixture-key';
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','USER_SECRETS_ENCRYPTION_KEY'];
  const before=names.map(name=>process.env[name]);
  process.env.SUPABASE_URL='https://integrity-fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';process.env.USER_SECRETS_ENCRYPTION_KEY=key;
  const originalFetch=globalThis.fetch;
  let rows:unknown[]=[];
  globalThis.fetch=async input=>{
    const url=new URL(String(input instanceof Request?input.url:input));
    assert.equal(url.origin,'https://integrity-fixture.invalid');assert.equal(url.pathname,'/rest/v1/user_integrations');
    assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
    return Response.json(rows);
  };
  const legacy=`enc:${Buffer.from(`fixture:${secret}`).toString('base64')}`;
  const iv=Buffer.alloc(12,7),cipher=createCipheriv('aes-256-gcm',scryptSync(key,'xroga-provider-keys-v2',32),iv);
  const data=Buffer.concat([cipher.update(secret),cipher.final()]);
  const valid=`v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
  const row=(access_token:unknown,provider='apikey_openai',metadata:unknown={})=>({
    user_id:owner,provider,access_token,metadata,credential_revision:'22222222-2222-4222-8222-222222222222',
  });
  try {
    for(const envelope of [valid,legacy,legacy.slice(4)]) {
      rows=[row(envelope)];assert.equal(await getUserProviderKey(owner,'openai'),secret);
    }
    for(const envelope of [null,{},42,'',`${valid}:`,`${valid}:extra`,valid.replace('v1:','v2:'),legacy+'!',
      `enc:${Buffer.from([255,254]).toString('base64')}`,`v1:${Buffer.alloc(8).toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`,
      `v1:${iv.toString('base64')}:${Buffer.alloc(16).toString('base64')}:${data.toString('base64')}`,'x'.repeat(70001)]) {
      rows=[row(envelope)];assert.equal(await getUserProviderKey(owner,'openai'),null);
      assert.deepEqual(await resolveProviderEnvForDeploy(owner),{});
    }
    for(const provider of ['apikey_supabase_pat','apikey_supabase_db_password','apikey_cws_oauth','apikey_expo']) {
      rows=[row(legacy,provider,{provider:'openai',env_var:'FORWARDED_SECRET',sync_target:'vercel'})];
      assert.deepEqual(await resolveProviderEnvForDeploy(owner),{},'Display metadata cannot make a server/publish-only row deployable');
    }
    for(const metadata of ['malformed',[],{provider:'stripe',env_var:'STRIPE_SECRET_KEY'},{provider:'openai',env_var:'BAD-NAME'},{provider:'openai',env_var:{}}]) {
      rows=[row(legacy,'apikey_openai',metadata)];
      await assert.rejects(resolveProviderEnvForDeploy(owner),error=>error instanceof Error && !error.message.includes(secret) && /metadata is invalid/.test(error.message));
    }
    rows=[row(legacy,'apikey_custom_my_key',{provider:'custom',env_var:'MY_KEY'})];
    assert.deepEqual(await resolveProviderEnvForDeploy(owner),{MY_KEY:secret});
  } finally {
    globalThis.fetch=originalFetch;
    names.forEach((name,index)=>{if(before[index]===undefined)delete process.env[name];else process.env[name]=before[index];});
  }
});
