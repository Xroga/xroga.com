import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDisposableConfiguration } from './disposable-supabase.mjs';
const safe = {CI:'true',XB01_DISPOSABLE_SUPABASE:'1',RUNNER_TEMP:'/tmp/xroga-fixture',GITHUB_ENV:'/tmp/fixture-env'};
test('local bootstrap requires explicit CI and refuses inherited production-capable configuration', () => {
  assert.ok(assertDisposableConfiguration(safe).endsWith('xroga-disposable-supabase'));
  for (const patch of [{CI:'false'},{XB01_DISPOSABLE_SUPABASE:'0'},{RUNNER_TEMP:''},{GITHUB_ENV:''},{SUPABASE_URL:'https://nzenxdfumxrnsmybazmo.supabase.co'},{SUPABASE_SERVICE_ROLE_KEY:'forbidden'},{SUPABASE_ACCESS_TOKEN:'forbidden'},{DATABASE_URL:'postgres://remote/db'},{LAUNCH_BILLING_API_URL:'https://billing.invalid'}]) {
    assert.throws(()=>assertDisposableConfiguration({...safe,...patch}));
  }
});
