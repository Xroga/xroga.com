import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logSystemError, systemErrorRecord } from './systemErrorLog.js';

test('diagnostics discard arbitrary secrets, metadata and unverified attribution', () => {
  const secret = 'PRIVATE_CANARY_UNRECOGNIZED_SECRET';
  const entry = { api: secret, errorMessage: `invalid api key ${secret}`, fallbackUsed: secret,
    severity: secret as never, userId: secret, sessionId: secret, runId: secret,
    metadata: { apiType: secret, nested: { secret }, url: `https://example.invalid/?key=${secret}` } };
  const record = systemErrorRecord(entry);
  assert.deepEqual(record, { api: 'unknown', error_message: 'authentication provider failure',
    fallback_used: null, severity: 'warning', user_id: null, session_id: null, run_id: null, metadata: {} });
  assert.ok(!JSON.stringify(record).includes(secret));
});

test('known operational labels remain useful and input metadata cannot mutate the snapshot', () => {
  const entry = { api: 'elevenlabs', errorMessage: 'timeout at PRIVATE_URL',
    fallbackUsed: 'trying next voice provider', metadata: { apiType: 'voice' } };
  const record = systemErrorRecord(entry);
  entry.metadata.apiType = 'PRIVATE_CANARY';
  assert.equal(record.error_message, 'timeout provider failure');
  assert.equal(record.api, 'elevenlabs');
  assert.equal(record.fallback_used, 'trying next voice provider');
  assert.deepEqual(record.metadata, { apiType: 'voice' });
  assert.equal(systemErrorRecord({ errorMessage: 'All providers exhausted' }).error_message, 'All providers exhausted');
});

test('console output and database failure handling never echo the source diagnostic', async () => {
  const originalFetch = globalThis.fetch, originalWarn = console.warn;
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const messages: unknown[][] = [], payloads: unknown[] = [];
  const secret = 'PRIVATE_LOG_CANARY';
  process.env.SUPABASE_URL = 'http://127.0.0.1:1'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key';
  console.warn = (...args: unknown[]) => { messages.push(args); };
  globalThis.fetch = async (_input, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return Response.json({ message: secret, code: 'XX000' }, { status: 400 });
  };
  try {
    await logSystemError({ errorMessage: secret, metadata: { secret }, api: secret });
    assert.equal(payloads.length, 1);
    assert.equal(messages.length, 2);
    assert.ok(!JSON.stringify({ messages, payloads }).includes(secret));
  } finally {
    globalThis.fetch = originalFetch; console.warn = originalWarn;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
