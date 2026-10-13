import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionAuthProject, resolveAuthBuildRealm } from './authBuildRealm.mjs';

const realm = 'abcdefghijklmnopqrst';
const isolated = { XROGA_ISOLATED_AUTH_BUILD:'1', CI:'true', E2E_ISOLATED_PROJECT_REF:realm, NEXT_PUBLIC_SUPABASE_URL:`https://${realm}.supabase.co`, SUPABASE_URL:`https://${realm}.supabase.co` };
test('production remains pinned despite arbitrary public URL or realm override', () => {
  assert.equal(resolveAuthBuildRealm({NEXT_PUBLIC_SUPABASE_URL:'https://wrong.supabase.co',NEXT_PUBLIC_XROGA_AUTH_PROJECT_REF:realm}), productionAuthProject);
});

test('disposable local auth is build-only, exact loopback and never admitted in production', () => {
  const local = { ...isolated, E2E_ISOLATED_PROJECT_REF:'local-disposable', XB01_DISPOSABLE_SUPABASE:'1', NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321', SUPABASE_URL:'http://127.0.0.1:54321' };
  assert.equal(resolveAuthBuildRealm(local), 'local-disposable');
  for (const change of [{CI:'false'}, {VERCEL_ENV:'production'}, {XB01_DISPOSABLE_SUPABASE:'0'}, {NEXT_PUBLIC_SUPABASE_URL:'http://localhost:54321'}, {SUPABASE_URL:'https://nzenxdfumxrnsmybazmo.supabase.co'}, {NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321/redirect'}]) {
    assert.throws(() => resolveAuthBuildRealm({...local,...change}), /Isolated auth build/);
  }
  assert.equal(resolveAuthBuildRealm({...local, XROGA_ISOLATED_AUTH_BUILD:'0'}), productionAuthProject);
});
test('explicit isolated CI build selects the test realm, not a founder bypass', () => {
  assert.equal(resolveAuthBuildRealm(isolated), realm);
});
test('isolated build rejects production, legacy, non-CI, malformed and mismatched targets', () => {
  for (const change of [{CI:'false'},{VERCEL_ENV:'production'},{E2E_ISOLATED_PROJECT_REF:productionAuthProject},{E2E_ISOLATED_PROJECT_REF:'lztqfktsahpzitybthld'},{E2E_ISOLATED_PROJECT_REF:'invalid'},{SUPABASE_URL:'https://wrong.supabase.co'},{NEXT_PUBLIC_SUPABASE_URL:'http://localhost'}]) {
    assert.throws(() => resolveAuthBuildRealm({...isolated,...change}), /Isolated auth build/);
  }
});
