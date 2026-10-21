import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logSystemError } from '../services/systemErrorLog.js';

export function registerSystemErrorLogTests(admin: SupabaseClient): void {
  test('real platform diagnostic storage contains only safe categories without raw secrets or forged attribution', async t => {
    assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const before = await admin.from('system_errors').select('id');
    assert.equal(before.error, null);
    const prior = new Set(before.data!.map(row => row.id));
    const inserted: string[] = [];
    t.after(async () => {
      if (inserted.length) assert.equal((await admin.from('system_errors').delete().in('id', inserted)).error, null);
    });
    const secret = `PRIVATE_DIAGNOSTIC_${randomUUID()}`;
    await logSystemError({ api: 'elevenlabs', errorMessage: `timeout ${secret}`,
      fallbackUsed: 'trying next voice provider', userId: randomUUID(), runId: randomUUID(), sessionId: secret,
      metadata: { apiType: 'voice', nested: { secret } } });
    const after = await admin.from('system_errors').select('*');
    assert.equal(after.error, null);
    const added = after.data!.filter(row => !prior.has(row.id));
    inserted.push(...added.map(row => row.id));
    assert.equal(added.length, 1);
    const row = added[0];
    assert.equal(row.api, 'elevenlabs'); assert.equal(row.error_message, 'timeout provider failure');
    assert.equal(row.user_id, null); assert.equal(row.session_id, null); assert.equal(row.run_id, null);
    assert.deepEqual(row.metadata, { apiType: 'voice' });
    assert.ok(!JSON.stringify(row).includes(secret));
  });
}
