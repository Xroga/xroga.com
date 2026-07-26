import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDatabaseUrls, resolveProjectRef, safeDatabaseMetadata } from './database-url.mjs';

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

test('SUPABASE_PROJECT_REF takes precedence over URL and config', () => {
  const beforeRef = process.env.SUPABASE_PROJECT_REF;
  const beforeUrl = process.env.SUPABASE_URL;
  process.env.SUPABASE_PROJECT_REF = 'explicitproject';
  process.env.SUPABASE_URL = 'https://differentproject.supabase.co';
  try {
    assert.equal(resolveProjectRef(), 'explicitproject');
  } finally {
    if (beforeRef === undefined) delete process.env.SUPABASE_PROJECT_REF;
    else process.env.SUPABASE_PROJECT_REF = beforeRef;
    if (beforeUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = beforeUrl;
  }
});

test('DATABASE_URL remains the complete session-pooler URL', () => {
  const before = process.env.DATABASE_URL;
  const databaseUrl = 'postgresql://postgres.example:raw%21value@pooler.example.test:5432/postgres';
  process.env.DATABASE_URL = databaseUrl;
  try {
    assert.deepEqual(resolveDatabaseUrls(), [databaseUrl]);
    assert.deepEqual(safeDatabaseMetadata(), {
      projectRef: 'nzenxdfumxrnsmybazmo',
      databaseHost: 'pooler.example.test',
      databasePort: 5432,
    });
  } finally {
    if (before === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = before;
  }
});
