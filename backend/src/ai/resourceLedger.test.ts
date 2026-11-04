import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTenantContext } from '../security/tenantContext.js';
import { ledgerBudgetPort, ResourceLedgerError, SupabaseResourceLedger } from './resourceLedger.js';

const owner = randomUUID();
const run = randomUUID();
const context = createTenantContext({ userId: owner, via: 'persisted_owner' });

function fake(answer: (name: string, args: Record<string, unknown>) => { data?: unknown; error?: { message: string } }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const service = () => ({ rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); const r = answer(name, args); return { data: r.data ?? null, error: r.error ?? null }; } }) as unknown as SupabaseClient;
  return { calls, ledger: new SupabaseResourceLedger(context, service) };
}

const reserveInput = { runId: run, category: 'sandbox_compute_seconds' as const, units: 300, key: 'attempt-key-1', cap: 3600, windowSeconds: 86_400 };

test('the owner always comes from the issued tenant context and the window is passed as bounded seconds', async () => {
  const { calls, ledger } = fake(() => ({ data: { state: 'reserved', reservationId: randomUUID() } }));
  const r = await ledger.reserve(reserveInput);
  assert.equal(r.state, 'reserved');
  assert.equal(calls[0]!.args.p_user, owner);
  assert.equal(calls[0]!.args.p_window, '86400 seconds');
  assert.equal(calls[0]!.args.p_cap, 3600, 'the cap is the caller\'s configuration');
});

test('an exhausted answer is surfaced with the numbers and creates no reservation id', async () => {
  const { ledger } = fake(() => ({ data: { state: 'exhausted', used: 3500, cap: 3600 } }));
  assert.deepEqual(await ledger.reserve(reserveInput), { state: 'exhausted', used: 3500, cap: 3600 });
});

test('invalid requests are refused before any database call', async () => {
  const { calls, ledger } = fake(() => ({ data: { state: 'reserved', reservationId: randomUUID() } }));
  for (const bad of [{ runId: 'not-a-uuid' }, { units: 0 }, { units: -1 }, { cap: 0 }, { key: 'short' }, { windowSeconds: 10 }, { windowSeconds: 40 * 86_400 }, { category: 'gpu_seconds' as never }]) {
    await assert.rejects(ledger.reserve({ ...reserveInput, ...bad }), (e: unknown) => e instanceof ResourceLedgerError && e.code === 'RESOURCE_INVALID');
  }
  await assert.rejects(ledger.settle('not-a-uuid', 5), /invalid/i);
  await assert.rejects(ledger.settle(randomUUID(), -1), /invalid/i);
  await assert.rejects(ledger.release('nope'), /invalid/i);
  assert.equal(calls.length, 0);
});

test('a database error never leaks its text, and a malformed answer is not trusted', async () => {
  const failing = fake(() => ({ error: { message: 'relation "engineering_resource_reservations" violates check constraint PRIVATE_CANARY' } }));
  await assert.rejects(failing.ledger.reserve(reserveInput), (e: Error) => !/PRIVATE_CANARY|engineering_resource/.test(e.message));
  const odd = fake(() => ({ data: { state: 'reserved', reservationId: 'not-a-uuid' } }));
  await assert.rejects(odd.ledger.reserve(reserveInput), /unexpected/);
  const unknown = fake(() => ({ data: { state: 'maybe' } }));
  await assert.rejects(unknown.ledger.settle(randomUUID(), 1), /unexpected/);
});

test('the repair budget port holds before an attempt and settles measured units once, or releases on cancellation', async () => {
  const id = randomUUID();
  const { calls, ledger } = fake((name) => name === 'reserve_engineering_resource' ? { data: { state: 'reserved', reservationId: id } }
    : name === 'settle_engineering_resource' ? { data: { state: 'settled', settledUnits: 42 } } : { data: { state: 'released' } });
  const port = ledgerBudgetPort(ledger, { runId: run, category: 'sandbox_compute_seconds', unitsPerAttempt: 300, cap: 3600, windowSeconds: 86_400, measured: () => 42 });
  assert.equal(await port.reserve(2), id);
  assert.equal(calls[0]!.args.p_key, 'repair-attempt-2', 'the key is stable per attempt, so a redelivery cannot double-hold');
  await port.settle(id, 'used');
  assert.equal(calls[1]!.name, 'settle_engineering_resource'); assert.equal(calls[1]!.args.p_actual, 42);
  await port.settle(id, 'released');
  assert.equal(calls[2]!.name, 'release_engineering_resource');
});

test('the budget port reports exhaustion as no reservation, so the repair controller blocks', async () => {
  const { ledger } = fake(() => ({ data: { state: 'exhausted', used: 3600, cap: 3600 } }));
  const port = ledgerBudgetPort(ledger, { runId: run, category: 'storage_bytes', unitsPerAttempt: 10, cap: 3600, windowSeconds: 86_400 });
  assert.equal(await port.reserve(1), null);
});
