import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

test('confirmation binds canonical roles and exact intent to one transaction before any execution', async () => {
  const action = { id: 'action', user_id: 'owner', project_id: 'project', environment_id: null, requested_by: 'owner',
    action_type: 'resume_automation', target_type: 'automation', target_id: 'project', target_version: 1,
    action_plan_digest: 'digest', confirmation_digest: null, execution_plan: {}, idempotency_key: 'key',
    permission_required: 'manage_automation', risk_level: 'high', max_attempts: 1, status: 'confirmation_required' };
  let patch: Record<string,unknown> = {}, errorCode: string | null = null, calls = 0;
  const db = { from(table: string) {
    const q = { select() { return q; }, eq() { return q; }, async maybeSingle() {
      if (table === 'operations_actions') return { data: action, error: null };
      if (table === 'projects') return { data: { id: 'project', user_id: 'owner' }, error: null };
      assert.equal(table, 'profiles'); return { data: { role: 'member' }, error: null };
    } }; return q;
  }, async rpc(name: string, args: Record<string,unknown>) {
    calls++; assert.equal(name, 'confirm_operations_action');
    assert.deepEqual(args, { p_actor: 'owner', p_expected: action, p_allowed_roles: ['operator','release_manager','recovery_manager','admin'], p_approval_role: 'recovery_manager' });
    return { data: [{ ...action, status: 'approval_required', confirmation_digest: 'digest', ...patch }], error: errorCode ? { code: errorCode } : null };
  } };
  const service = new OperationsService(db as unknown as SupabaseClient);
  const confirm = () => service.confirmAction('owner','action');
  assert.equal((await confirm()).status, 'approval_required'); assert.equal(calls, 1);
  for (patch of [{ id: 'other' }, { requested_by: 'other' }, { user_id: 'other' }, { project_id: 'other' },
    { execution_plan: { changed: true } }, { confirmation_digest: 'other' }, { status: 'verified' }]) {
    await assert.rejects(confirm(), { code: 'unknown', statusCode: 503 });
  }
  patch = {};
  for (const [code, expected] of [['42501','forbidden'],['40001','conflict'],['08006','unknown'],['23514','unknown']]) {
    errorCode = code; await assert.rejects(confirm(), { code: expected });
  }
  const before = calls;
  await assert.rejects(service.confirmAction('foreign','action'), { code: 'forbidden' });
  action.id = 'substituted'; await assert.rejects(confirm(), { code: 'unknown' }); assert.equal(calls, before);
});
