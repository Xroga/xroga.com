import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

test('approval delegates one role-bound transaction and rejects changed or uncertain receipts', async () => {
  const action = { id: 'action', user_id: 'owner', project_id: 'project', environment_id: null, requested_by: 'owner',
    action_type: 'resume_automation', target_type: 'automation', target_id: 'project', target_version: 1,
    action_plan_digest: 'digest', confirmation_digest: 'digest', execution_plan: {}, idempotency_key: 'key', status: 'approval_required' };
  let role = 'recovery_manager', requiredRole = 'recovery_manager', calls = 0, errorCode: string | null = null;
  let patch: Record<string,unknown> = {};
  const db = {
    from(table: string) {
      const q = { select() { return q; }, eq() { return q; }, async maybeSingle() {
        if (table === 'operations_actions') return { data: action, error: null };
        if (table === 'projects') return { data: { id: 'project', user_id: 'owner' }, error: null };
        if (table === 'profiles') return { data: { role: 'member' }, error: null };
        if (table === 'operations_memberships') return { data: { role }, error: null };
        assert.equal(table, 'operations_action_approvals');
        return { data: { required_role: requiredRole, expires_at: new Date(Date.now()+60_000).toISOString() }, error: null };
      } }; return q;
    },
    async rpc(name: string, args: Record<string,unknown>) {
      calls++; assert.equal(name, 'decide_operations_action_approval');
      assert.deepEqual(args, { p_actor: 'approver', p_expected: action, p_required_role: 'recovery_manager', p_decision: 'approved', p_reason: 'Reviewed fixture' });
      return { data: [{ ...action, status: 'approved', ...patch }], error: errorCode ? { code: errorCode } : null };
    },
  };
  const service = new OperationsService(db as unknown as SupabaseClient);
  const approve = () => service.approveAction('approver','action','approved','Reviewed fixture');
  assert.equal((await approve()).status, 'approved'); assert.equal(calls, 1);
  for (const [code, expected] of [['42501','forbidden'],['40001','conflict'],['P0001','invalid_state'],['22023','precondition_failed'],['08006','unknown']]) {
    errorCode = code; await assert.rejects(approve(), { code: expected });
  }
  errorCode = null;
  for (patch of [{ user_id: 'foreign' }, { id: 'other' }, { status: 'verified' }, { execution_plan: { changed: true } }, { requested_by: 'other' }]) {
    await assert.rejects(approve(), { code: 'unknown', statusCode: 503 });
  }
  const before = calls; role = 'viewer';
  await assert.rejects(approve(), { code: 'forbidden', statusCode: 403 }); assert.equal(calls, before);
  role = 'recovery_manager'; requiredRole = 'release_manager';
  await assert.rejects(approve(), { code: 'invalid_state', statusCode: 409 }); assert.equal(calls, before);
});
