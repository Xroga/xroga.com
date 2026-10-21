import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envVarForProvider, saveUserProviderKey, resolveProviderEnvForDeploy } from './userProviderKeys.js';

test('private vault credentials reject browser-public aliases before admission and at historical egress',async t=>{
  const owner='11111111-1111-4111-8111-111111111111';
  const prefixes=['NEXT_PUBLIC_','VITE_','EXPO_PUBLIC_','REACT_APP_','PUBLIC_','GATSBY_','VUE_APP_','NUXT_PUBLIC_'];
  let calls=0,env='';
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];const previous=names.map(name=>process.env[name]);
  process.env.SUPABASE_URL='https://public-env-fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
  t.after(()=>names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];}));
  t.mock.method(globalThis,'fetch',async()=>{
    calls++;return Response.json([{provider:'apikey_openai',access_token:`enc:${Buffer.from('fixture:PRIVATE_CANARY').toString('base64')}`,metadata:{provider:'openai',env_var:env}}]);
  });
  for(const prefix of prefixes){
    for(const provider of ['openai','stripe','custom','supabase']){
      await assert.rejects(saveUserProviderKey(owner,provider,'PRIVATE_CANARY',{envVarName:`${prefix.toLowerCase()}secret`}),/browser-public/);
    }
  }
  assert.equal(calls,0);
  for(const prefix of prefixes){env=`${prefix}SECRET`;await assert.rejects(resolveProviderEnvForDeploy(owner),error=>error instanceof Error&&/browser-public/.test(error.message)&&!error.message.includes('PRIVATE_CANARY'));}
  assert.equal(envVarForProvider('supabase_url'),'NEXT_PUBLIC_SUPABASE_URL');
  assert.equal(envVarForProvider('supabase_anon'),'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  assert.equal(envVarForProvider('openai','PRIVATE_AI_KEY'),'PRIVATE_AI_KEY');
  assert.throws(()=>envVarForProvider('supabase','NEXT_PUBLIC_SUPABASE_ANON_KEY'),/browser-public/);
  assert.throws(()=>envVarForProvider('custom','NEXT_PUBLIC_SUPABASE_URL'),/browser-public/);
});
