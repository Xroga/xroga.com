import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

const cases = [
  { method: 'defineActivation', input: { projectId: 'project', name: 'activation', version: 1, requiredEvents: ['identity.linked.v1'] }, expected: { project_id: 'project', required_event_names: ['identity.linked.v1'] } },
  { method: 'recommend', input: { projectId: 'project', consent: true }, expected: { project_id: 'project' } },
  { method: 'transitionLifecycle', input: { projectId: 'project', subjectType: 'user', subjectId: 'subject', state: 'retained', evidenceReference: 'proof' }, expected: { project_id: 'project', subject_id: 'subject', lifecycle_state: 'retained', evidence_reference: 'proof' } },
  { method: 'suppress', input: { projectId: 'project', channel: 'in_app', address: 'user', reason: 'manual', evidenceReference: 'proof' }, expected: { project_id: 'project', channel: 'in_app', reason: 'manual', source_evidence: 'proof' } },
  { method: 'recordAttribution', input: { projectId: 'project', anonymousId: 'anonymous', touchType: 'first', source: 'original', evidenceReference: 'proof' }, expected: { project_id: 'project', anonymous_id: 'anonymous', source: 'original', evidence_reference: 'proof' } },
  { method: 'createSegment', input: { projectId: 'project', name: 'segment', lifecycleStates: ['activated'] }, expected: { project_id: 'project', definition: { lifecycleStates: ['activated'] } } },
  { method: 'createCampaign', input: { projectId: 'project', segmentId: 'segment', name: 'campaign', channel: 'in_app', templateKey: 'template', idempotencyKey: 'key' }, expected: { project_id: 'project', segment_id: 'segment', channel: 'in_app', template_key: 'template' } },
  { method: 'createExperiment', input: { projectId: 'project', key: 'experiment', seed: 'seed', variants: [{ key: 'a', weight: 1 }], minimumSampleSize: 10 }, expected: { project_id: 'project', variants: [{ key: 'a', weight: 1 }], allocation_seed: 'seed', minimum_sample_size: 10 } },
  { method: 'recordExperimentOutcome', input: { experimentId: 'experiment', assignmentId: 'assignment', eventId: 'event', metricKey: 'metric' }, expected: { experiment_id: 'experiment', assignment_id: 'assignment', event_id: 'event', metric_key: 'metric' } },
];

for (const fixture of cases) test(`${fixture.method} retains admitted input across the first database wait`, async () => {
  let enter!: () => void, release!: () => void, firstRead = true, writes = 0;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const stop = new Error('fixture stops before persistence');
  const db = { from(table: string) {
    const q = {
      select() { return q; }, eq() { return q; }, not() { return q; }, order() { return q; }, limit() { return q; },
      insert(row: Record<string, unknown>) {
        writes++;
        for (const [key, value] of Object.entries(fixture.expected)) assert.deepEqual(row[key], value, key);
        throw stop;
      },
      upsert(row: Record<string, unknown>) { return q.insert(row); },
      async maybeSingle() {
        if (firstRead) { firstRead = false; enter(); await gate; }
        const data = table === 'projects' ? { id: 'project', user_id: 'actor' }
          : table === 'profiles' ? { role: 'member' }
          : table === 'growth_experiments' ? { project_id: 'project', tenant_id: 'actor' }
          : table === 'growth_experiment_assignments' ? { id: 'assignment', exposed_at: '2026-01-01T00:00:00Z' }
          : table === 'analytics_events' ? { id: 'event' }
          : table === 'growth_segments' ? { id: 'segment' } : null;
        return { data, error: null };
      },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [], error: null })); },
    }; return q;
  }, async rpc(name:string,args:Record<string,unknown>) {
    assert.equal(name,'record_growth_experiment_outcome');writes++;
    const row={experiment_id:args.p_experiment,assignment_id:args.p_assignment,event_id:args.p_event,metric_key:args.p_metric};
    for(const [key,value]of Object.entries(fixture.expected))assert.deepEqual(row[key as keyof typeof row],value,key);
    throw stop;
  } };
  const service = new GrowthService(db as unknown as SupabaseClient);
  const input = structuredClone(fixture.input) as Record<string, unknown>;
  const call = service[fixture.method as keyof GrowthService] as (actor: string, value: unknown) => Promise<unknown>;
  const pending = call.call(service, 'actor', input);
  const rejected = assert.rejects(pending, error => error === stop);
  await entered;
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) { if (typeof value[0] === 'object') value[0].weight = 99; else value[0] = 'changed'; }
    else input[key] = typeof value === 'number' ? 999 : typeof value === 'boolean' ? false : 'changed';
  }
  release(); await rejected; assert.equal(writes, 1);
});
