import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProtectedPlatformEnvironment, parseProtectedPlatformConfiguration } from './platformEnvironment.js';

const bundle=(environment: Record<string,unknown>)=>Buffer.from(JSON.stringify({schemaVersion:1,target:'xroga-api-google',environment}));
test('protected configuration is validated atomically before provider clients can observe it',()=>{
  const env: Record<string,string|undefined>={K_SERVICE:'synthetic-api',XROGA_PLATFORM_CONFIG_FILE:'/secrets/xroga-platform/config.json'};
  assert.equal(loadProtectedPlatformEnvironment(env,()=>bundle({OPENROUTER_API_KEY:'SYNTHETIC_PRIVATE_CANARY',SCRAPFLY_API_KEY:'SYNTHETIC_SCRAPFLY_CANARY'})),2);
  assert.equal(env.OPENROUTER_API_KEY,'SYNTHETIC_PRIVATE_CANARY');
  assert.equal(env.SCRAPFLY_API_KEY,'SYNTHETIC_SCRAPFLY_CANARY');
});

test('foreign identity, release and process-injection configuration never reaches process environment',()=>{
  for(const name of ['FLY_APP_NAME','XROGA_SANDBOX_FLY_TOKEN','XROGA_GOOGLE_WIF_AUDIENCE',
    'GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_CREDENTIALS','CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
    'GCE_METADATA_HOST','NODE_OPTIONS','LD_PRELOAD','PATH','HOME','K_SERVICE','PORT','XROGA_RELEASE_SHA',
    'XROGA_CREDENTIAL_KMS_PROVIDER','XROGA_GOOGLE_CLOUD_KMS_KEY_NAME','XROGA_PLATFORM_CONFIG_FILE']) {
    const env: Record<string,string|undefined>={XROGA_PLATFORM_CONFIG_FILE:'/secrets/xroga-platform/config.json'};
    assert.throws(()=>loadProtectedPlatformEnvironment(env,()=>bundle({VALID_PLATFORM_TOKEN:'PRIVATE_CANARY',[name]:'PRIVATE_CANARY'})),
      {message:'Protected platform configuration is invalid.'});
    assert.equal(env.VALID_PLATFORM_TOKEN,undefined);
  }
});

test('mixed secret sources, malformed, oversized and structurally invalid bundles fail with redacted errors',()=>{
  const samples=[Buffer.from('PRIVATE_INVALID_JSON_CANARY'),Buffer.alloc(65537),bundle({BAD:'bad\0value'}),
    bundle({BAD:123}),bundle({}),Buffer.from(JSON.stringify({schemaVersion:1,target:'wrong',environment:{KEY:'PRIVATE_CANARY'}})),
    Buffer.from('{"schemaVersion":1,"target":"xroga-api-google","environment":{"__proto__":"PRIVATE_CANARY"}}')];
  for(const raw of samples)assert.throws(()=>parseProtectedPlatformConfiguration(raw,{}),{message:'Protected platform configuration is invalid.'});
  assert.throws(()=>parseProtectedPlatformConfiguration(bundle({EXISTING_KEY:'PRIVATE_CANARY'}),{EXISTING_KEY:'OTHER_PRIVATE_CANARY'}),
    {message:'Protected platform configuration is invalid.'});
});

test('native Google mount is exact, missing files are redacted and current environment installs remain unchanged',()=>{
  assert.equal(loadProtectedPlatformEnvironment({EXISTING:'unchanged'}),0);
  for(const path of ['relative.json','/different/config.json'])assert.throws(()=>loadProtectedPlatformEnvironment(
    {K_SERVICE:'synthetic',XROGA_PLATFORM_CONFIG_FILE:path},()=>bundle({KEY:'PRIVATE_CANARY'})),{message:'Protected platform configuration is invalid.'});
  assert.throws(()=>loadProtectedPlatformEnvironment({XROGA_PLATFORM_CONFIG_FILE:'/secrets/xroga-platform/config.json'},
    ()=>{throw new Error('PRIVATE_FILE_ERROR_CANARY');}),{message:'Protected platform configuration is invalid.'});
});
