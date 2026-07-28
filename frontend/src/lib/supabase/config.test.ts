import assert from 'node:assert/strict';
import test from 'node:test';
import { getSupabasePublicConfig } from './config';

const APPROVED_KEY = 'sb_publishable_test_key';

test('uses the approved public endpoint even when hosting configuration is stale', () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mweinwhoekwjrecsodip.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = APPROVED_KEY;

  try {
    assert.deepEqual(getSupabasePublicConfig(), {
      url: 'https://nzenxdfumxrnsmybazmo.supabase.co',
      publishableKey: APPROVED_KEY,
      projectRef: 'nzenxdfumxrnsmybazmo',
    });
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});

test('rejects a server credential in browser configuration', () => {
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_secret_never_browser';
  try {
    assert.throws(getSupabasePublicConfig, /server credential/);
  } finally {
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
