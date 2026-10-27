import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeCredentialVaultForServer, managedCredentialConfiguration, credentialVaultReadinessMiddleware } from './credentialVaultStartup.js';
import express from 'express';
import { createServer } from 'node:http';
import type { CryptoProvider } from './cryptoProvider.js';
import { OciKmsCryptoProvider } from './ociKmsCryptoProvider.js';

const env = { NODE_ENV: 'production', XROGA_CREDENTIAL_KMS_PROVIDER: 'oci',
  XROGA_OCI_KMS_KEY_ID: 'ocid1.key.oc1.me-dubai-1.fixture.aaaaaaaa',
  XROGA_OCI_KMS_ENDPOINT: 'https://fixture-crypto.kms.me-dubai-1.oci.oraclecloud.com',
  XROGA_OCI_KMS_KEY_VERSION: 'ocid1.keyversion.oc1.me-dubai-1.fixture.aaaaaaaa',
  XROGA_OCI_KMS_AUTH_MODE: 'resource_principal', XROGA_OCI_KMS_PRINCIPAL_ID: 'ocid1.fnfunc.oc1.me-dubai-1.fixture.aaaaaaaa' };

test('native Google runtime refuses operator credentials and mixed platform identity before provider construction', async () => {
  const native = { NODE_ENV:'production', K_SERVICE:'xroga-api', K_REVISION:'xroga-api-fixture',
    XROGA_CREDENTIAL_KMS_PROVIDER:'google_cloud', XROGA_GOOGLE_CLOUD_AUTH_MODE:'metadata_adc',
    XROGA_GOOGLE_CLOUD_KMS_KEY_NAME:'projects/synthetic/locations/us-central1/keyRings/test/cryptoKeys/test' };
  assert.equal(managedCredentialConfiguration(native)?.provider, 'google_cloud');
  for (const override of [
    {GOOGLE_APPLICATION_CREDENTIALS:'/operator/adc.json'},
    {GOOGLE_CREDENTIALS:'PRIVATE_STATIC_CREDENTIAL_CANARY'},
    {CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE:'/operator/profile.json'},
    {GCE_METADATA_HOST:'attacker.invalid'},
    {GCE_METADATA_IP:'192.0.2.9'},
    {FLY_APP_NAME:'xroga-api'},
    {XROGA_GOOGLE_WIF_AUDIENCE:'//iam.googleapis.com/stale-federation'},
  ]) {
    let calls = 0;
    await assert.rejects(initializeCredentialVaultForServer({...native,...override}, {
      create:async () => { calls++; return fixture().provider; },
      install:() => { throw new Error('must not install'); },
    }), /configuration is invalid/);
    assert.equal(calls, 0);
  }
});

test('Fly production cannot inherit metadata ADC or interactive credentials without exact workload federation', () => {
  const fly = {NODE_ENV:'production', FLY_APP_NAME:'xroga-api', FLY_MACHINE_ID:'e820730b296098',
    XROGA_CREDENTIAL_KMS_PROVIDER:'google_cloud',
    XROGA_GOOGLE_CLOUD_KMS_KEY_NAME:'projects/synthetic/locations/us-central1/keyRings/test/cryptoKeys/test'};
  assert.throws(() => managedCredentialConfiguration(fly), /configuration is invalid/);
  assert.throws(() => managedCredentialConfiguration({...fly, GOOGLE_APPLICATION_CREDENTIALS:'/operator-or-downloaded-key.json'}), /configuration is invalid/);
});
// Explicit refusing/echo transport fixtures, never provider-backed custody proof.
function fixture() {
  let unavailable = false, encrypts = 0, decrypts = 0;
  const provider: CryptoProvider = {
    kind: 'managed',
    async wrapDataKey(value) { encrypts++; if (unavailable) throw Error('PRIVATE_AUTH_OR_PROVIDER_CANARY');
      return {keyId:env.XROGA_OCI_KMS_KEY_ID,wrappedKey:Buffer.from(value).toString('base64')}; },
    async unwrapDataKey(value) { decrypts++; if (unavailable) throw Error('PRIVATE_AUTH_OR_PROVIDER_CANARY');
      return Buffer.from(value.wrappedKey,'base64'); },
  };
  return {provider,deny:()=>{unavailable=true;},recover:()=>{unavailable=false;},counts:()=>({encrypts,decrypts})};
}

test('managed startup validates explicit provider and forbids incomplete, conflicting and interactive configuration before auth', async () => {
  assert.equal(managedCredentialConfiguration({NODE_ENV:'development'}),undefined);
  for (const invalid of [
    {NODE_ENV:'production'}, {FLY_APP_NAME:'isolated-test'}, {VERCEL_ENV:'production'},
    {...env,XROGA_CREDENTIAL_KMS_PROVIDER:'development'}, {...env,XROGA_CREDENTIAL_KMS_PROVIDER:''},
    {...env,XROGA_OCI_KMS_KEY_ID:''}, {...env,XROGA_OCI_KMS_KEY_VERSION:''},
    {...env,XROGA_OCI_KMS_PRINCIPAL_ID:''}, {...env,XROGA_OCI_KMS_PRINCIPAL_ID:'ocid1.user.oc1..aaaaaaaa'},
    {...env,XROGA_OCI_KMS_KEY_ID:'foreign-invalid-key'}, {...env,XROGA_OCI_KMS_ENDPOINT:'https://attacker.invalid'},
    {...env,XROGA_OCI_KMS_KEY_VERSION:'ocid1.keyversion.oc1.us-ashburn-1.fixture.aaaaaaaa'},
    {...env,XROGA_GOOGLE_CLOUD_KMS_KEY_NAME:'projects/synthetic/locations/global/keyRings/test/cryptoKeys/test'},
    ...['cloud_shell','workload_session','api_key','DEFAULT'].map(mode=>({...env,XROGA_OCI_KMS_AUTH_MODE:mode})),
  ]) {
    let calls=0;
    await assert.rejects(initializeCredentialVaultForServer(invalid,{create:async()=>{calls++;return fixture().provider;}}),/configuration is invalid/);
    assert.equal(calls,0);
  }
  assert.equal(managedCredentialConfiguration(env)?.provider,'oci');
  assert.equal(managedCredentialConfiguration({...env,XROGA_OCI_KMS_AUTH_MODE:'instance_principal'})?.provider,'oci');
  assert.equal(managedCredentialConfiguration({XROGA_CREDENTIAL_KMS_PROVIDER:'google_cloud',XROGA_GOOGLE_CLOUD_KMS_KEY_NAME:'projects/synthetic/locations/global/keyRings/test/cryptoKeys/test'})?.provider,'google_cloud');
});

test('startup installs the single managed provider only after an exact synthetic roundtrip', async () => {
  const f=fixture();let installed:CryptoProvider|undefined;
  const state=await initializeCredentialVaultForServer(env,{create:async configuration=>{
    assert.equal(configuration.provider,'oci');return f.provider;
  },install:p=>{assert.deepEqual(f.counts(),{encrypts:1,decrypts:1});installed=p;}});
  assert.equal(installed,f.provider);assert.equal(await state.checkReadiness(),true);
  assert.deepEqual(f.counts(),{encrypts:1,decrypts:1});
});

test('expired identity, KMS denial and outage fixtures prevent startup with safe errors and no fallback', async () => {
  for (const failure of ['EXPIRED_IDENTITY_PRIVATE_CANARY','KMS_DENIED_PRIVATE_CANARY','OUTAGE_PRIVATE_CANARY']) {
    let installs=0;
    await assert.rejects(initializeCredentialVaultForServer(env,{create:async()=>{throw Error(failure);},install:()=>{installs++;}}),
      {message:'CredentialVault managed provider initialization failed.'});
    const f=fixture();f.deny();
    await assert.rejects(initializeCredentialVaultForServer(env,{create:async()=>f.provider,install:()=>{installs++;}}),
      {message:'CredentialVault managed provider readiness failed.'});
    assert.equal(installs,0);
  }
});

test('readiness coalesces probes, reports outage and recovers without switching provider', async () => {
  const f=fixture();let clock=0,installs=0;
  const state=await initializeCredentialVaultForServer(env,{create:async()=>f.provider,install:()=>{installs++;},now:()=>clock,cacheMs:100});
  f.deny();clock=101;
  assert.deepEqual(await Promise.all(Array.from({length:10},()=>state.checkReadiness())),Array(10).fill(false));
  assert.deepEqual(f.counts(),{encrypts:2,decrypts:1});
  f.recover();clock=202;
  assert.equal(await state.checkReadiness(),true);assert.equal(installs,1);
  assert.deepEqual(f.counts(),{encrypts:3,decrypts:2});
});

test('managed startup rejects development providers, wrong-key receipts and bounded hung initialization', async () => {
  const f=fixture();let installs=0;
  await assert.rejects(initializeCredentialVaultForServer(env,{create:async()=>({...f.provider,kind:'development'}),install:()=>{installs++;}}));
  const wrong=new OciKmsCryptoProvider(env.XROGA_OCI_KMS_KEY_ID,{
    encrypt:async()=>({keyId:env.XROGA_OCI_KMS_KEY_ID+'b',keyVersionId:env.XROGA_OCI_KMS_KEY_VERSION,encryptionAlgorithm:'AES_256_GCM',ciphertext:'AAAA'}),
    decrypt:async()=>{throw Error('Must never decrypt an invalid receipt');},
  });
  await assert.rejects(initializeCredentialVaultForServer(env,{create:async()=>wrong,install:()=>{installs++;}}));
  await assert.rejects(initializeCredentialVaultForServer(env,{create:()=>new Promise(()=>{}),install:()=>{installs++;},timeoutMs:10}));
  assert.equal(installs,0);
});

test('API startup awaits vault admission before listening and readiness fails closed without exposing provider errors', () => {
  const source=readFileSync(new URL('../../index.ts',import.meta.url),'utf8');
  assert.ok(source.indexOf('await initializeCredentialVaultForServer()')<source.indexOf('const app = express()'));
  assert.ok(source.indexOf('await initializeCredentialVaultForServer()')<source.indexOf('server.listen('));
  assert.ok(source.includes("app.get('/ready', credentialVaultReadinessMiddleware(credentialVaultReadiness)"));
});

test('actual readiness HTTP middleware returns redacted 503 on outage and recovers without changing liveness', async () => {
  const f=fixture();let clock=0;
  const state=await initializeCredentialVaultForServer(env,{create:async()=>f.provider,install:()=>{},now:()=>clock,cacheMs:100});
  const app=express();app.get('/health',(_req,res)=>res.json({status:'ok'}));
  app.get('/ready',credentialVaultReadinessMiddleware(state),(_req,res)=>res.json({status:'ready'}));
  const server=createServer(app);
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
  try {
    const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(base+'/ready')).status,200);
    f.deny();clock=101;
    const denied=await fetch(base+'/ready');assert.equal(denied.status,503);
    assert.deepEqual(await denied.json(),{status:'not_ready',reason:'credential_provider_unavailable'});
    assert.equal((await fetch(base+'/health')).status,200);
    f.recover();clock=202;assert.equal((await fetch(base+'/ready')).status,200);
  } finally {server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
});
