/**
 * The counters exist to make Supabase call volume observable. They must never
 * become a second place where credentials or private content leak.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  approximateBytes,
  getSupabaseCounterText,
  recordSupabaseCall,
  resetSupabaseCounters,
  snapshotSupabaseCounters,
} from './supabaseCallCounters.js';

const SECRET_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.super-secret-access-token.signature';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const PRIVATE_MESSAGE = 'my production database password is hunter2';

beforeEach(() => resetSupabaseCounters());

describe('Supabase call counters', () => {
  it('counts calls per table, operation and outcome', () => {
    recordSupabaseCall({ table: 'profiles', operation: 'select', outcome: 'ok' });
    recordSupabaseCall({ table: 'profiles', operation: 'select', outcome: 'ok' });
    recordSupabaseCall({ table: 'profiles', operation: 'select', outcome: 'skipped_cache' });

    const snapshot = snapshotSupabaseCounters();
    const ok = Object.entries(snapshot).find(
      ([key]) => key.includes('profiles') && key.includes('select') && key.includes('ok')
    );
    assert.ok(ok, 'an ok select on profiles must be counted');
    assert.equal(ok?.[1], 2);
  });

  it('exposes counters in a scrapeable text format', () => {
    recordSupabaseCall({ table: 'terminal_sessions', operation: 'upsert', outcome: 'ok' }, 512);
    const text = getSupabaseCounterText();
    assert.match(text, /terminal_sessions/);
    assert.match(text, /upsert/);
  });

  it('records nothing that could identify a user or reveal a credential', () => {
    // A caller might pass user-derived values by mistake. Whatever the labels are,
    // the exposed text must not contain the token, the user id, or message content.
    recordSupabaseCall(
      { table: 'user_token_usage', operation: 'select', outcome: 'ok' },
      approximateBytes({ token: SECRET_TOKEN, userId: USER_ID, content: PRIVATE_MESSAGE })
    );

    const text = getSupabaseCounterText();
    assert.ok(!text.includes(SECRET_TOKEN), 'the access token must never reach the counters');
    assert.ok(!text.includes(USER_ID), 'user ids must never reach the counters');
    assert.ok(!text.includes('hunter2'), 'message content must never reach the counters');
    assert.ok(!text.includes(PRIVATE_MESSAGE));
  });

  it('measures payload size without retaining the payload', () => {
    const payload = { content: PRIVATE_MESSAGE };
    const size = approximateBytes(payload);
    assert.equal(size, Buffer.byteLength(JSON.stringify(payload), 'utf8'));
    assert.ok(!getSupabaseCounterText().includes(PRIVATE_MESSAGE));
  });

  it('reports zero bytes for an unserializable payload rather than throwing', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.equal(approximateBytes(cyclic), 0);
  });

  it('bounds label cardinality so a hostile table name cannot explode the series', () => {
    const hostile = `a"b\n${'x'.repeat(500)}`;
    recordSupabaseCall({ table: hostile, operation: 'select', outcome: 'ok' });
    const text = getSupabaseCounterText();
    assert.ok(!text.includes('\n' + 'x'.repeat(200)), 'labels must be truncated');
    assert.ok(!text.includes('a"b'), 'quotes and newlines must be sanitised out of labels');
  });
});
