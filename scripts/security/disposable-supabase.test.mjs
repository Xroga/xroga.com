import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPublicKey, verify } from 'node:crypto';
import { assertDisposableConfiguration, assertDisposedStack, redactLocalLog, generateLocalSigningKey, generateLocalApiToken, disposableCliPackages } from './disposable-supabase.mjs';
const safe = {CI:'true',XB01_DISPOSABLE_SUPABASE:'1',RUNNER_TEMP:'/tmp/xroga-fixture',GITHUB_ENV:'/tmp/fixture-env'};

test('disposable CLI explicitly requires the matching pinned Linux binary instead of optional-install success',()=>{
  assert.deepEqual(disposableCliPackages,['--package=supabase@2.120.0','--package=@supabase/cli-linux-x64@2.120.0']);
});

test('disposable teardown verifies stopped containers and retained volumes without touching another stack',()=>{
  const env={...safe,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2'};
  assert.doesNotThrow(()=>assertDisposedStack(env,[],[]));
  assert.doesNotThrow(()=>assertDisposedStack(env,['supabase_db_xroga-ci-123-1'],['unrelated-volume']));
  for(const [containers,volumes] of [[['supabase_db_xroga-ci-123-2'],[]],[[],['supabase_storage_xroga-ci-123-2']]])assert.throws(()=>assertDisposedStack(env,containers,volumes),/still has/);
  for(const change of [{CI:'false'},{GITHUB_RUN_ID:''},{GITHUB_RUN_ATTEMPT:'*'}])assert.throws(()=>assertDisposedStack({...env,...change},[],[]),/CI run identity/);
});
test('local bootstrap requires explicit CI and refuses inherited production-capable configuration', () => {
  assert.ok(assertDisposableConfiguration(safe).endsWith('xroga-disposable-supabase'));
  for (const patch of [{CI:'false'},{XB01_DISPOSABLE_SUPABASE:'0'},{RUNNER_TEMP:''},{GITHUB_ENV:''},{SUPABASE_URL:'https://nzenxdfumxrnsmybazmo.supabase.co'},{SUPABASE_SERVICE_ROLE_KEY:'forbidden'},{SUPABASE_ACCESS_TOKEN:'forbidden'},{DATABASE_URL:'postgres://remote/db'},{LAUNCH_BILLING_API_URL:'https://billing.invalid'}]) {
    assert.throws(()=>assertDisposableConfiguration({...safe,...patch}));
  }
});
test('generated per-run Auth signing key admits sign and verify operations',()=>{
  const first=generateLocalSigningKey(),second=generateLocalSigningKey();
  assert.deepEqual(first.key_ops,['sign','verify']);assert.equal(first.alg,'ES256');assert.equal(first.kty,'EC');
  assert.notEqual(first.kid,second.kid);assert.notEqual(first.d,second.d);assert.ok(first.d);
});

test('disposable file delivery keys cannot be inherited from another environment',()=>{
  assert.throws(()=>assertDisposableConfiguration({...safe,FILE_DELIVERY_SIGNING_KEY:'forbidden-inherited-key'}));
});

test('API role tokens verify against the same configured ES256 key, not a legacy secret',()=>{
  const key=generateLocalSigningKey(),other=generateLocalSigningKey();
  for(const role of ['anon','service_role']) {
    const [header,payload,signature]=generateLocalApiToken(key,role,1000).split('.');
    assert.deepEqual(JSON.parse(Buffer.from(header,'base64url')),{alg:'ES256',typ:'JWT',kid:key.kid});
    assert.deepEqual(JSON.parse(Buffer.from(payload,'base64url')),{role,iss:'supabase',iat:1000,exp:8200});
    const valid = signingKey => verify('sha256',Buffer.from(`${header}.${payload}`),{key:createPublicKey({key:signingKey,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'));
    assert.equal(valid(key),true); assert.equal(valid(other),false);
  }
  assert.throws(()=>generateLocalApiToken(key,'owner'));
});
test('local diagnostics retain failure reason but not JWTs, API keys or database passwords', () => {
  const text = 'invalid config fixtureSecret eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature sb_secret_abcdef postgres://postgres:password@127.0.0.1:54322/postgres';
  const safe=redactLocalLog(text,['fixtureSecret']);
  assert.match(safe,/invalid config/);
  for(const forbidden of ['fixtureSecret','eyJhb','sb_secret_abcdef','postgres://','password@']) assert.ok(!safe.includes(forbidden));
});
