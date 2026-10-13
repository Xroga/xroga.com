import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDisposableConfiguration, redactLocalLog, generateLocalSigningKey } from './disposable-supabase.mjs';
const safe = {CI:'true',XB01_DISPOSABLE_SUPABASE:'1',RUNNER_TEMP:'/tmp/xroga-fixture',GITHUB_ENV:'/tmp/fixture-env'};
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
test('local diagnostics retain failure reason but not JWTs, API keys or database passwords', () => {
  const text = 'invalid config fixtureSecret eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature sb_secret_abcdef postgres://postgres:password@127.0.0.1:54322/postgres';
  const safe=redactLocalLog(text,['fixtureSecret']);
  assert.match(safe,/invalid config/);
  for(const forbidden of ['fixtureSecret','eyJhb','sb_secret_abcdef','postgres://','password@']) assert.ok(!safe.includes(forbidden));
});
