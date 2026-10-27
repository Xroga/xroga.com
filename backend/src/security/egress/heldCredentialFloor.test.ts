import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyOutboundData,containsCredentialSecretText} from './dataClassification.js';

test('opaque held credentials cannot escape through innocent text labels or simple encodings',()=>{
  const name='COMPOSIO_API_KEY',previous=process.env[name],opaque='47c290e1fca94383b7829427aab52651';process.env[name]=opaque;
  try{
    for(const value of [opaque,encodeURIComponent(opaque),Buffer.from(opaque).toString('base64'),Buffer.from(opaque).toString('base64url')]){
      assert.equal(containsCredentialSecretText('ordinary query '+value),true);
      assert.equal(classifyOutboundData({query:'ordinary query '+value},'PUBLIC').classification,'CREDENTIAL_SECRET');
    }
    process.env[name]='different-opaque-credential-value';assert.equal(containsCredentialSecretText(opaque),false,'No stale secret-value cache');
  }finally{if(previous===undefined)delete process.env[name];else process.env[name]=previous;}
});

test('public environment values and model configuration do not become private credentials',()=>{
  const values={NEXT_PUBLIC_EXAMPLE_API_KEY:'public-browser-publishable-example',SUPABASE_ANON_KEY:'public-anon-example-value',GLM_MODEL_ID:'public-model-configuration-example',XROGA_GOOGLE_KMS_KEY:'projects/public-project/locations/global/keyRings/r/cryptoKeys/k'};
  const old=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);
  try{for(const value of Object.values(values))assert.equal(containsCredentialSecretText(value),false);}
  finally{for(const[key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
