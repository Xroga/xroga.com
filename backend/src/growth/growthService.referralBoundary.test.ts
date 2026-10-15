import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

test('growth events require the exact existing project referral attribution before writing', async () => {
  let attribution: Record<string, unknown> | null = null;
  let storageError = false, inserts = 0;
  const db = { from(table: string) {
    const filters: Record<string, unknown> = {}; let payload: Record<string, unknown> = {};
    const q = {
      select() { return q; }, eq(key: string, value: unknown) { filters[key] = value; return q; },
      insert(row: Record<string, unknown>) { inserts++; payload = row; return q; },
      async maybeSingle() {
        if (table === 'projects') return { data: { id: 'project', user_id: 'actor' }, error: null };
        if (table === 'profiles') return { data: { role: 'member' }, error: null };
        if (table === 'analytics_events') return { data: null, error: null };
        assert.equal(table, 'growth_referral_attribution');
        assert.deepEqual(filters, { tenant_id: 'actor', project_id: 'project', referral_id: 'referral' });
        return { data: attribution, error: storageError ? { message: 'PRIVATE_CANARY' } : null };
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(resolve({ data: [{ id: 'event', ...payload }], error: null }));
      },
    }; return q;
  } };
  const service = new GrowthService(db as unknown as SupabaseClient);
  const input = { projectId: 'project', name: 'referral.attributed.v1', idempotencyKey: 'key', environment: 'test' as const,
    referralId: 'referral', consentState: 'granted' as const, source: 'fixture', evidenceReference: 'fixture' };
  const valid = { tenant_id: 'actor', project_id: 'project', referral_id: 'referral' };
  for (attribution of [null, { ...valid, tenant_id: 'other' }, { ...valid, project_id: 'other' }, { ...valid, referral_id: 'other' }]) {
    await assert.rejects(service.recordEvent('actor', input), { code: 'not_found', statusCode: 404 });
    assert.equal(inserts, 0);
  }
  attribution = valid; storageError = true;
  await assert.rejects(service.recordEvent('actor', input), { message: 'Event referral unavailable', statusCode: 503 });
  assert.equal(inserts, 0);
  storageError = false;
  const result = await service.recordEvent('actor', input);
  assert.equal(inserts, 1); assert.equal(result.duplicate, false);
  assert.equal(result.event.referral_id, 'referral'); assert.equal(result.event.tenant_id, 'actor');
  assert.equal(result.event.project_id, 'project');
});
