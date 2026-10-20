import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';
import { PROVIDER_PRICE_VERSION } from '../ai/providerBudget.js';

export function registerOperationsProviderBudgetTests(
  admin: SupabaseClient,
  getUsers: () => readonly { id: string; project: string; token: string }[],
): void {
  test('real Operations reservations bind current two-person authority and serialize the approved spend ceiling', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    const [owner, requester] = getUsers();
    const priorOwner = await admin.from('profiles').select('role').eq('id', owner.id).single();
    const priorRequester = await admin.from('profiles').select('role').eq('id', requester.id).single();
    assert.equal(priorOwner.error, null); assert.equal(priorRequester.error, null);
    let actionId = '';
    t.after(async () => {
      if (actionId) {
        assert.equal((await admin.from('xroga_provider_reservations').delete().eq('authority_action_id', actionId)).error, null);
        assert.equal((await admin.from('operations_actions').delete().eq('id', actionId)).error, null);
      }
      assert.equal((await admin.from('profiles').update({ role: priorOwner.data.role }).eq('id', owner.id)).error, null);
      assert.equal((await admin.from('profiles').update({ role: priorRequester.data.role }).eq('id', requester.id)).error, null);
    });
    assert.equal((await admin.from('profiles').update({ role: 'admin' }).in('id', [owner.id, requester.id])).error, null);

    const service = new OperationsService(admin);
    const created = await service.createAction(requester.id, {
      actionType: 'run_model_benchmark', projectId: owner.project, targetType: 'model_benchmark',
      targetId: owner.project, targetVersion: 1, idempotencyKey: randomUUID(), confirmed: true,
      parameters: { maximumCostUsd: 1, maximumCases: 2 },
    });
    actionId = created.id;
    const approved = await service.approveAction(owner.id, actionId, 'approved', 'Disposable spend-bound fixture');
    const claim = await admin.rpc('claim_operations_action_admitted', {
      p_actor: requester.id, p_expected: approved, p_allowed_roles: ['release_manager', 'admin'],
      p_approval_role: 'release_manager', p_confirmation_required: true, p_lease_seconds: 60,
    });
    assert.equal(claim.error, null); assert.equal(claim.data?.length, 1);
    const running = claim.data[0];
    assert.equal(running.execution_plan.maximumCostUsd, 1);

    const args = (idempotencyKey: string, amount: number) => ({
      p_actor: requester.id, p_expected: running, p_idempotency_key: idempotencyKey,
      p_internal_route: 'kimi_k3', p_price_version: PROVIDER_PRICE_VERSION,
      p_estimated_input_tokens: 100, p_maximum_output_tokens: 100, p_reservation_micro_usd: amount,
    });
    const firstKey = randomUUID();
    const first = await admin.rpc('reserve_operations_provider_budget', args(firstKey, 200_000));
    assert.equal(first.error, null); assert.equal(first.data.authority_action_id, actionId);
    assert.equal(Number(first.data.authority_ceiling_micro_usd), 1_000_000);
    const replay = await admin.rpc('reserve_operations_provider_budget', args(firstKey, 200_000));
    assert.equal(replay.error, null); assert.equal(replay.data.id, first.data.id);
    assert.equal((await admin.rpc('reserve_operations_provider_budget', args(firstKey, 200_001))).error?.code, '40001');

    const concurrent = await Promise.all([
      admin.rpc('reserve_operations_provider_budget', args(randomUUID(), 500_000)),
      admin.rpc('reserve_operations_provider_budget', args(randomUUID(), 500_000)),
    ]);
    assert.equal(concurrent.filter(result => !result.error).length, 1);
    assert.equal(concurrent.filter(result => result.error?.code === 'P0001').length, 1);
    const committed = await admin.from('xroga_provider_reservations').select('reserved_micro_usd,status')
      .eq('authority_action_id', actionId);
    assert.equal(committed.error, null);
    assert.equal(committed.data.reduce((sum, row) => sum + Number(row.reserved_micro_usd), 0), 700_000);

    assert.equal((await admin.from('profiles').update({ role: 'user' }).eq('id', requester.id)).error, null);
    assert.equal((await admin.rpc('reserve_operations_provider_budget', args(randomUUID(), 1_000))).error?.code, '42501');
    assert.equal((await admin.from('profiles').update({ role: 'admin' }).eq('id', requester.id)).error, null);
    assert.equal((await admin.from('operations_action_approvals').update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('action_id', actionId)).error, null);
    assert.equal((await admin.rpc('reserve_operations_provider_budget', args(randomUUID(), 1_000))).error?.code, '40001');

    for (const token of [undefined, requester.token]) {
      const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
      });
      assert.equal((await browser.rpc('reserve_operations_provider_budget', args(randomUUID(), 1_000))).error?.code, '42501');
    }
  });
}
