import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionAuthProject, resolveAuthBuildRealm } from './authBuildRealm.mjs';

const realm = 'abcdefghijklmnopqrst';
const isolated = { XROGA_ISOLATED_AUTH_BUILD:'1', CI:'true', E2E_ISOLATED_PROJECT_REF:realm, NEXT_PUBLIC_SUPABASE_URL:`https://${realm}.supabase.co`, SUPABASE_URL:`https://${realm}.supabase.co` };
test('production remains pinned despite arbitrary public URL or realm override', () => {
  assert.equal(resolveAuthBuildRealm({NEXT_PUBLIC_SUPABASE_URL:'https://wrong.supabase.co',NEXT_PUBLIC_XROGA_AUTH_PROJECT_REF:realm}), productionAuthProject);
});
test('explicit isolated CI build selects the test realm, not a founder bypass', () => {
  assert.equal(resolveAuthBuildRealm(isolated), realm);
});
test('isolated build rejects production, legacy, non-CI, malformed and mismatched targets', () => {
  for (const change of [{CI:'false'},{VERCEL_ENV:'production'},{E2E_ISOLATED_PROJECT_REF:productionAuthProject},{E2E_ISOLATED_PROJECT_REF:'lztqfktsahpzitybthld'},{E2E_ISOLATED_PROJECT_REF:'invalid'},{SUPABASE_URL:'https://wrong.supabase.co'},{NEXT_PUBLIC_SUPABASE_URL:'http://localhost'}]) {
    assert.throws(() => resolveAuthBuildRealm({...isolated,...change}), /Isolated auth build/);
  }
});
