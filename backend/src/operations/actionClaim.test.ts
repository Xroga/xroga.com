import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';
import { createInternalAdapter, ProviderAdapterRegistry } from './providerAdapters.js';

test('only the exact admitted action and current attempt receipt can reach an adapter', async () => {
  const action = { id: 'action', user_id: 'actor', project_id: 'project', environment_id: null, requested_by: 'actor',
    action_type: 'emergency_stop', target_type: 'automation', target_id: 'project', target_version: 1,
    idempotency_key: 'key', action_plan_digest: 'digest', confirmation_digest: 'digest', permission_required: 'manage_automation',
    risk_level: 'high', execution_plan: { reason: 'fixture' }, max_attempts: 1, attempt_count: 0, status: 'queued' };
  const running = { ...action, status: 'running', attempt_count: 1, lease_owner: 'api:actor', lease_expires_at: new Date(Date.now() + 60_000).toISOString() };
  let claim: unknown = [running], fallback: Record<string, unknown> = { ...action, status: 'verified' }, reads = 0, effects = 0, writes = 0;
  let completionPatch: Record<string, unknown> | null = null, completionError = false;
  const db = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'complete_operations_action') {
        writes++;
        assert.equal(args.p_actor, 'actor'); assert.deepEqual(args.p_expected, running);
        assert.equal(args.p_provider, 'internal_database');
        return { data: [{ ...running, status: 'blocked', evidence_reference: args.p_evidence_id, lease_owner: null, lease_expires_at: null, ...completionPatch }], error: completionError ? { code: '40001' } : null };
      }
      assert.equal(name, 'operations_claim_action');
      assert.deepEqual(args, { p_action_id: 'action', p_lease_owner: 'api:actor', p_lease_seconds: 60 });
      return { data: claim, error: null };
    },
    from(table: string) {
      let patch: Record<string, unknown> = {};
      const q = {
        select() { return q; }, eq() { return q; },
        insert() { writes++; return q; }, update(value: Record<string, unknown>) { patch = value; writes++; return q; },
        async maybeSingle() {
          if (table === 'projects') return { data: { id: 'project', user_id: 'actor' }, error: null };
          if (table === 'profiles') return { data: { role: 'member' }, error: null };
          assert.equal(table, 'operations_actions'); return { data: reads++ === 0 ? action : fallback, error: null };
        },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: table === 'operations_actions' ? [{ ...action, ...patch }] : [], error: null })); },
      }; return q;
    },
  };
  const service = new OperationsService(db as unknown as SupabaseClient);
  (service as unknown as { registry: ProviderAdapterRegistry }).registry.register(createInternalAdapter(async (_capability, input) => {
    effects++; assert.equal(input.userId, 'actor'); assert.equal(input.projectId, 'project');
    assert.equal(input.targetId, 'project'); return { status: 'unsupported', safeSummary: 'Fixture has no external action' };
  }));
  const invalid = ['id','user_id','project_id','environment_id','requested_by','action_type','target_type','target_id',
    'target_version','action_plan_digest','confirmation_digest','permission_required','risk_level','execution_plan','max_attempts','lease_owner','status']
    .map(field => [{ ...running, [field]: 'changed' }]);
  invalid.push([{ ...running, lease_expires_at: new Date(0).toISOString() }]);
  for (claim of [...invalid, [null], [running, running], {}, [{ ...running, attempt_count: 0 }], [{ ...running, attempt_count: 1.5 }]]) {
    reads = 0; await assert.rejects(service.executeAction('actor', 'action'), { code: 'unknown', statusCode: 503 });
    assert.equal(effects, 0); assert.equal(writes, 0);
  }
  claim = [];
  for (const patch of [{ user_id: 'foreign' }, { id: 'other' }, { execution_plan: { reason: 'changed' } }]) {
    reads = 0; fallback = { ...action, status: 'verified', ...patch };
    await assert.rejects(service.executeAction('actor', 'action'), { code: 'conflict', statusCode: 409 });
  }
  reads = 0; fallback = { ...action, status: 'verified' };
  assert.equal((await service.executeAction('actor', 'action')).status, 'verified'); assert.equal(effects, 0);
  reads = 0; claim = [running];
  assert.equal((await service.executeAction('actor', 'action')).status, 'blocked'); assert.equal(effects, 1);
  for (completionPatch of [{ user_id: 'foreign' }, { evidence_reference: 'other' }, { status: 'verified' }, { attempt_count: 2 }, { lease_owner: 'still-held' }]) {
    reads = 0; effects = 0; writes = 0;
    await assert.rejects(service.executeAction('actor', 'action'), { code: 'unknown', statusCode: 503 });
    assert.equal(effects, 1); assert.equal(writes, 1, 'one atomic completion, no fallback persistence or provider retry');
  }
  completionPatch = null; completionError = true; reads = 0; effects = 0; writes = 0;
  await assert.rejects(service.executeAction('actor', 'action'), { code: 'unknown', statusCode: 503 });
  assert.equal(effects, 1); assert.equal(writes, 1);
});
