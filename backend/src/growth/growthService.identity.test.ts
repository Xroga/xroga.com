import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

test('identity admission binds original project and evidence across ownership and persistence waits', async () => {
  let entered!: () => void, resume!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { resume = resolve; });
  const input = { projectId: 'project', anonymousId: 'anonymous', evidenceReference: 'proof' };
  const expected = { tenant_id: 'actor', project_id: 'project', anonymous_id: 'anonymous', user_id: 'actor' };
  const db = { from(table: string) {
    let inserting = false;
    const filters: Record<string, unknown> = {};
    const q = {
      select() { return q; }, eq(key: string, value: unknown) { filters[key] = value; return q; },
      upsert(row: unknown) { inserting = true; assert.deepEqual(row, { ...expected, evidence_reference: 'proof' }); return q; },
      update(row: unknown) { assert.deepEqual(row, { evidence_reference: 'proof' }); return q; },
      async maybeSingle() {
        if (table === 'projects') { entered(); await gate; return { data: { id: 'project', user_id: 'actor' }, error: null }; }
        return { data: { role: 'member' }, error: null };
      },
      then(resolve: (value: unknown) => unknown) {
        if (inserting) {
          input.evidenceReference = 'changed-again';
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        assert.deepEqual(filters, expected);
        return Promise.resolve(resolve({ data: [{ id: 'identity', ...expected, evidence_reference: 'proof' }], error: null }));
      },
    }; return q;
  } };
  const pending = new GrowthService(db as unknown as SupabaseClient).linkIdentity('actor', input);
  await started;
  input.projectId = 'foreign'; input.anonymousId = 'foreign'; input.evidenceReference = 'changed';
  resume();
  assert.equal((await pending).evidence_reference, 'proof');
});

test('identity linking preserves first owner and verifies exact mutation receipt', async () => {
  let outcome = 'valid';
  const db = { from(table: string) {
    const filters: Record<string, unknown> = {}; let inserting = false;
    const q = {
      select() { return q; }, eq(key: string, value: unknown) { filters[key] = value; return q; },
      upsert(value: unknown, options: unknown) { inserting = true; assert.deepEqual(options, { onConflict: 'tenant_id,project_id,anonymous_id', ignoreDuplicates: true }); return q; },
      update(value: unknown) { assert.deepEqual(value, { evidence_reference: 'proof' }); return q; },
      async maybeSingle() { return { error: null, data: table === 'projects' ? { id: 'project', user_id: 'actor' } : { role: 'member' } }; },
      then(resolve: (value: unknown) => unknown) {
        assert.equal(table, 'growth_identity_links');
        if (inserting) return Promise.resolve(resolve({ data: null, error: outcome === 'insertError' ? { message: 'private' } : null }));
        assert.deepEqual(filters, { tenant_id: 'actor', project_id: 'project', anonymous_id: 'anonymous', user_id: 'actor' });
        const row = { id: 'identity', ...filters, evidence_reference: 'proof', ...(outcome.startsWith('wrong:') ? { [outcome.slice(6)]: 'foreign' } : {}) };
        return Promise.resolve(resolve({ error: outcome === 'updateError' ? { message: 'private' } : null, data: outcome === 'conflict' ? [] : outcome === 'multiple' ? [row, row] : [row] }));
      },
    }; return q;
  } };
  const service = new GrowthService(db as unknown as SupabaseClient);
  const input = { projectId: 'project', anonymousId: 'anonymous', evidenceReference: 'proof' };
  assert.equal((await service.linkIdentity('actor', input)).id, 'identity');
  outcome = 'conflict'; await assert.rejects(service.linkIdentity('actor', input), { code: 'identity_conflict', statusCode: 409 });
  for (const invalid of ['insertError', 'updateError', 'multiple', 'wrong:tenant_id', 'wrong:project_id', 'wrong:user_id', 'wrong:anonymous_id', 'wrong:evidence_reference']) {
    outcome = invalid; await assert.rejects(service.linkIdentity('actor', input), { code: 'storage_unavailable', statusCode: 503 });
  }
});
