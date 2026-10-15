import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

test('missing growth resources remain null and deny before downstream authority or mutation', async () => {
  const db = { from() {
    const query = { select() { return query; }, eq() { return query; },
      async maybeSingle() { return { data: null, error: null }; },
      insert() { throw new Error('Missing resource must not write'); },
      update() { throw new Error('Missing resource must not write'); } };
    return query;
  } };
  const service = new GrowthService(db as unknown as SupabaseClient);
  for (const operation of [() => service.processCampaign('actor', 'missing'),
    () => service.assignExperiment('actor', 'missing', 'subject'),
    () => service.exposeExperiment('actor', 'missing', 'evidence'),
    () => service.recordExperimentOutcome('actor', { experimentId: 'missing', assignmentId: 'missing', eventId: 'missing', metricKey: 'fixture' }),
    () => service.experimentResult('actor', 'missing')]) {
    await assert.rejects(operation(), { code: 'not_found', statusCode: 404 });
  }
});

test('growth replay cannot return another project event and absent replay performs the real insert', async () => {
  let existing: Record<string, unknown> | null = { id: 'secret-event', project_id: 'other-project' };
  let inserts = 0;
  const db = { from(table: string) {
    let payload: unknown;
    const query = { select() { return query; }, eq() { return query; },
      insert(row: unknown) { inserts++; payload = row; return query; },
      async maybeSingle() {
        if (table === 'projects') return { data: { id: 'project', user_id: 'actor' }, error: null };
        if (table === 'profiles') return { data: { role: 'member' }, error: null };
        assert.equal(table, 'analytics_events'); return { data: existing, error: null };
      },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [{ id: 'new-event', ...(payload as object) }], error: null })); },
    };
    return query;
  } };
  const service = new GrowthService(db as unknown as SupabaseClient);
  const input = { projectId: 'project', name: 'identity.linked.v1', idempotencyKey: 'fixture', environment: 'test' as const,
    consentState: 'granted' as const, source: 'fixture', evidenceReference: 'fixture' };
  await assert.rejects(service.recordEvent('actor', input), { code: 'idempotency_conflict', statusCode: 409 });
  assert.equal(inserts, 0);
  existing = null;
  const created = await service.recordEvent('actor', input);
  assert.equal(created.duplicate, false); assert.equal(created.event.id, 'new-event');
  assert.equal(created.event.tenant_id, 'actor'); assert.equal(created.event.project_id, 'project');
  assert.equal(inserts, 1);
  existing = { id: 'same-project-event', project_id: 'project' };
  const replay = await service.recordEvent('actor', input);
  assert.equal(replay.duplicate, true); assert.equal(replay.event.id, 'same-project-event'); assert.equal(inserts, 1);
});
