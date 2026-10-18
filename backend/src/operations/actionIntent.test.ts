import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';
import type { SafeActionRequest } from './types.js';

const request = (): SafeActionRequest => ({ actionType: 'prepare_repair', projectId: 'project', targetType: 'service',
  targetId: 'resource', targetVersion: 1, idempotencyKey: 'key', confirmed: false, parameters: { nested: { value: 'original' } } });

function fixture() {
  const state = { mode: 'create', stored: null as Record<string, unknown> | null, audits: 0, replayReads: 0,
    onProject: async () => {}, onInsert: (_table: string, _row: Record<string, unknown>) => {},
    onEq: (_table: string, _key: string, _value: unknown) => {} };
  const db = { from(table: string) {
    let inserted: Record<string, unknown> = {};
    const q = {
      select() { return q; }, eq(key: string, value: unknown) { state.onEq(table, key, value); return q; },
      insert(row: Record<string, unknown>) { state.onInsert(table, row); inserted = row; if (table === 'production_audit_log') state.audits++; return q; },
      async single() {
        assert.equal(table, 'operations_actions');
        if (state.mode === 'conflict') return { data: null, error: { code: '23505' } };
        if (state.mode === 'outage') return { data: null, error: { code: 'XX000' } };
        state.stored = { id: 'action', ...inserted };
        return { data: state.mode === 'bad-receipt' ? { ...state.stored, requested_by: 'other' } : state.stored, error: null };
      },
      async maybeSingle() {
        if (table === 'projects') { await state.onProject(); return { data: { id: 'project', user_id: 'actor' }, error: null }; }
        if (table === 'profiles') return { data: { role: 'member' }, error: null };
        if (table === 'operations_resources') return { data: { version: 1 }, error: null };
        assert.equal(table, 'operations_actions'); state.replayReads++; return { data: state.stored, error: null };
      },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [], error: null })); },
    }; return q;
  } };
  return { state, service: new OperationsService(db as unknown as SupabaseClient) };
}

test('action retry binds owner, actor, target and plan and cannot hide non-conflict insert failures', async () => {
  const { state, service } = fixture(), input = request();
  const first = await service.createAction('actor', input); assert.equal(first.status, 'confirmation_required');
  const original = state.stored!; state.mode = 'conflict';
  assert.equal((await service.createAction('actor', input)).id, 'action');
  for (const field of ['user_id','requested_by','project_id','environment_id','action_type','target_type','target_id',
    'target_version','idempotency_key','action_plan_digest','permission_required','risk_level','execution_plan']) {
    state.stored = { ...original, [field]: 'changed' };
    await assert.rejects(service.createAction('actor', input), { code: 'conflict', statusCode: 409 });
  }
  state.stored = original;
  await assert.rejects(service.createAction('actor', { ...input, parameters: { nested: { value: 'changed' } } }), { code: 'conflict' });
  const reads = state.replayReads; state.mode = 'outage';
  await assert.rejects(service.createAction('actor', input), { code: 'unknown', statusCode: 503 });
  assert.equal(state.replayReads, reads);
  state.mode = 'bad-receipt';
  await assert.rejects(service.createAction('actor', input), { code: 'unknown', statusCode: 503 });
  assert.equal(state.audits, 1, 'invalid or replayed receipts do not generate a fresh audit/approval or execution');
});

test('action snapshot retains admitted project and nested plan during authority await', async () => {
  const { state, service } = fixture(), input = request();
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  state.onProject = async () => { enter(); await gate; };
  const pending = service.createAction('actor', input); await entered;
  input.projectId = 'foreign'; input.targetId = 'foreign'; input.confirmed = true;
  (input.parameters!.nested as { value: string }).value = 'changed'; release();
  const saved = await pending;
  assert.equal(saved.project_id, 'project'); assert.equal(saved.target_id, 'resource');
  assert.equal(saved.status, 'confirmation_required'); assert.deepEqual(saved.execution_plan, { nested: { value: 'original' } });
});

test('cyclic action input fails safely before authority lookup', async () => {
  const { state, service } = fixture(), input = request();
  input.parameters = { cycle: input };
  state.onProject = async () => { throw new Error('must not query'); };
  await assert.rejects(service.createAction('actor', input), { code: 'precondition_failed', statusCode: 400, message: 'Operation input is invalid' });
});

test('automation rule and signal snapshots precede asynchronous permission lookup', async () => {
  for (const kind of ['rule', 'signal']) {
    const { state, service } = fixture(); let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    state.onProject = async () => { enter(); await gate; };
    const stop = new Error('stop at validated boundary');
    if (kind === 'rule') {
      const input = { ruleKey: 'rule', name: 'original', triggerType: 'fixture', riskLevel: 'medium' as const,
        actionType: 'prepare_repair', conditions: { level: 'original' }, exclusions: {}, maxRuns: 1, windowSeconds: 60, enabled: false };
      state.onInsert = (table, row) => {
        assert.equal(table, 'operations_automation_rules'); assert.equal(row.action_type, 'prepare_repair');
        assert.deepEqual(row.conditions, { level: 'original' }); assert.equal(row.enabled, false); throw stop;
      };
      const pending = assert.rejects(service.createAutomationRule('actor', 'project', input), error => error === stop);
      await entered; input.conditions.level = 'changed'; input.actionType = 'emergency_stop'; input.enabled = true; release(); await pending;
    } else {
      const signal = { triggerType: 'original', triggerId: 'trigger', targetType: 'service', targetId: 'resource', targetVersion: 1, attributes: {} };
      state.onEq = (table, key, value) => {
        if (table === 'operations_automation_rules' && key === 'trigger_type') { assert.equal(value, 'original'); throw stop; }
      };
      const pending = assert.rejects(service.evaluateAutomationSignal('actor', 'project', signal), error => error === stop);
      await entered; signal.triggerType = 'changed'; release(); await pending;
    }
  }
});
