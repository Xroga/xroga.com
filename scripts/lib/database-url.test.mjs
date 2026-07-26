import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProjectRef } from './database-url.mjs';

test('SUPABASE_URL overrides the repository fallback project', () => {
  const before = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'https://runtimeproject.supabase.co';
  try {
    assert.equal(resolveProjectRef(), 'runtimeproject');
  } finally {
    if (before === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = before;
  }
});
