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
  },async rpc(name:string,args:Record<string,unknown>){
    assert.equal(name,'record_growth_event');
    if(existing)return{data:{event:existing,duplicate:true},error:null};
    inserts++;
    return{data:{event:{id:'new-event',...(args.p_intent as object),tenant_id:args.p_tenant,occurred_at:new Date().toISOString()},duplicate:false},error:null};
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
  existing = { ...created.event, id: 'same-project-event' };
  const replay = await service.recordEvent('actor', input);
  assert.equal(replay.duplicate, true); assert.equal(replay.event.id, 'same-project-event'); assert.equal(inserts, 1);
});

test('growth parent relations reject foreign segments, tenants and events before writes', async () => {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    projects: [{ id: 'project', user_id: 'actor' }], profiles: [{ id: 'actor', role: 'member' }],
    growth_segments: [{ id: 'segment', tenant_id: 'other', project_id: 'other-project', status: 'active' }],
    growth_campaigns: [{ id: 'campaign', tenant_id: 'actor', project_id: 'project', segment_id: 'segment', status: 'running', channel: 'in_app' }],
    growth_experiments: [{ id: 'experiment', tenant_id: 'other', project_id: 'project' }],
    growth_experiment_assignments: [{ id: 'assignment', experiment_id: 'experiment', tenant_id: 'actor', exposed_at: '2026-01-01', growth_experiments: { project_id: 'project', tenant_id: 'other' } }],
    analytics_events: [{ id: 'event', tenant_id: 'other', project_id: 'other-project', experiment_id: 'experiment' }],
  };
  let mutations = 0;
  const db = { from(table: string) {
    const filters: Array<[string, unknown]> = []; let payload: unknown;
    const q = {
      select() { return q; }, eq(key: string, value: unknown) { filters.push([key, value]); return q; },
      is() { return q; },
      insert(value: unknown) { mutations++; payload = value; return q; },
      upsert(value: unknown) { mutations++; payload = value; return q; },
      update(value: unknown) { mutations++; payload = value; return q; },
      async maybeSingle() { return { data: (rows[table] ?? []).find(row => filters.every(([key, value]) => row[key] === value)) ?? null, error: null }; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [{ id: 'saved', ...(payload as object) }], error: null })); },
    }; return q;
  }, async rpc(name: string,args: Record<string,unknown>) {
    assert.equal(name,'record_growth_experiment_outcome');mutations++;
    return {data:[{id:'saved',experiment_id:args.p_experiment,assignment_id:args.p_assignment,event_id:args.p_event,metric_key:args.p_metric}],error:null};
  } };
  const service = new GrowthService(db as unknown as SupabaseClient);
  const outcome = { experimentId: 'experiment', assignmentId: 'assignment', eventId: 'event', metricKey: 'fixture' };
  const denied = { code: 'not_found', statusCode: 404 };
  const eventInput = { projectId: 'project', name: 'identity.linked.v1', idempotencyKey: 'new-key', environment: 'test' as const, consentState: 'granted' as const, source: 'fixture', evidenceReference: 'fixture' };
  await assert.rejects(service.recordEvent('actor', { ...eventInput, experimentId: 'experiment' }), denied);
  await assert.rejects(service.recordEvent('actor', { ...eventInput, campaignId: 'foreign-campaign' }), denied);
  await assert.rejects(service.createCampaign('actor', { projectId: 'project', segmentId: 'segment', name: 'fixture', channel: 'in_app', templateKey: 'fixture', idempotencyKey: 'fixture' }), denied);
  await assert.rejects(service.processCampaign('actor', 'campaign'), denied);
  for (const invoke of [() => service.assignExperiment('actor', 'experiment', 'subject'), () => service.experimentResult('actor', 'experiment'),
    () => service.exposeExperiment('actor', 'assignment', 'fixture'), () => service.recordExperimentOutcome('actor', outcome)]) await assert.rejects(invoke(), denied);
  assert.equal(mutations, 0);
  rows.growth_experiments[0].tenant_id = 'actor';
  await assert.rejects(service.recordExperimentOutcome('actor', outcome), denied);
  rows.analytics_events[0] = { id: 'event', tenant_id: 'actor', project_id: 'project', experiment_id: 'different' };
  await assert.rejects(service.recordExperimentOutcome('actor', outcome), denied);
  assert.equal(mutations, 0);
  rows.analytics_events[0].experiment_id = 'experiment';
  assert.equal((await service.recordExperimentOutcome('actor', outcome)).id, 'saved');
  assert.equal(mutations, 1);
});
