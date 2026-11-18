import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { categoryFor, estimatedSeconds, meterCanonicalSandbox, meterRemoteWorkerRun, remoteWorkerResourceLabel, type MeteredCallDeps } from './meteredExecution.js';
import { ResourceExhaustedError, ResourceMeter, type MeterConfig } from '../ai/resourceMeter.js';
import type { ReserveOutcome, ResourceCategory, ResourceLedger, SettleOutcome } from '../ai/resourceLedger.js';

const owner = randomUUID();
const run = randomUUID();

class RecordingLedger implements ResourceLedger {
  reserved: Array<{ category: ResourceCategory; units: number; runId: string }> = []; settled: number[] = []; resources: Array<string | undefined> = []; used = 0;
  async reserve(i: { category: ResourceCategory; units: number; cap: number; runId: string }): Promise<ReserveOutcome> {
    if (this.used + i.units > i.cap) return { state: 'exhausted', used: this.used, cap: i.cap };
    this.used += i.units; this.reserved.push({ category: i.category, units: i.units, runId: i.runId }); return { state: 'reserved', reservationId: randomUUID() };
  }
  async settle(_id: string, actual: number, resource?: string): Promise<SettleOutcome> { this.settled.push(actual); this.resources.push(resource); return { state: 'settled', settledUnits: actual }; }
  async release() { return { state: 'released' as const }; }
}

function deps(over: { enabled?: boolean; caps?: MeterConfig['caps']; attempt?: { userId: string; runId: string } | null; ledger?: RecordingLedger } = {}) {
  const ledger = over.ledger ?? new RecordingLedger();
  const config: MeterConfig = { enabled: over.enabled ?? true, caps: over.caps ?? {}, windowSeconds: 86_400 };
  const d: MeteredCallDeps = {
    config: () => config,
    attempt: async () => (over.attempt === undefined ? { userId: owner, runId: run } : over.attempt),
    meterFor: (_userId, c) => new ResourceMeter(ledger, c),
  };
  return { d, ledger };
}

test('the category follows the caller: browser verification is browser time, everything else is sandbox compute', () => {
  assert.equal(categoryFor('browser-verification'), 'browser_session_seconds');
  for (const caller of ['compile-validator', 'universal-validation', 'software-agent-command'] as const) assert.equal(categoryFor(caller), 'sandbox_compute_seconds');
});

test('the held estimate is the stage timeouts when staged, otherwise the call timeout, and never below one second', () => {
  assert.equal(estimatedSeconds({ timeoutMs: 60_000 }), 60);
  assert.equal(estimatedSeconds({ timeoutMs: 60_000, stages: [{ timeoutMs: 30_000 }, { timeoutMs: 45_000 }] }), 75);
  assert.equal(estimatedSeconds({ timeoutMs: 100 }), 1);
});

test('metering off (the default): a straight call that never looks up an attempt or touches the ledger', async () => {
  const base = deps({ enabled: false }); const ledger = base.ledger;
  let looked = false;
  const d: MeteredCallDeps = { ...base.d, attempt: async () => { looked = true; return { userId: owner, runId: run }; } };
  assert.equal(await meterCanonicalSandbox('software-agent-command', { timeoutMs: 1000 }, async () => 'ran', d), 'ran');
  assert.equal(looked, false); assert.equal(ledger.reserved.length, 0);
});

test('metered: the owner and run come from the admitted attempt, browser time and compute are separate, and measured seconds are settled', async () => {
  const { d, ledger } = deps();
  await meterCanonicalSandbox('universal-validation', { timeoutMs: 90_000 }, async () => 'tests', d);
  await meterCanonicalSandbox('browser-verification', { timeoutMs: 45_000 }, async () => 'page', d);
  assert.deepEqual(ledger.reserved.map((r) => [r.category, r.units, r.runId]), [['sandbox_compute_seconds', 90, run], ['browser_session_seconds', 45, run]]);
  assert.equal(ledger.settled.length, 2, 'each call settled exactly once');
});

test('an exhausted allowance refuses the call before the sandbox runs', async () => {
  const { d } = deps({ caps: { sandbox_compute_seconds: 100 } });
  await meterCanonicalSandbox('software-agent-command', { timeoutMs: 80_000 }, async () => 'first', d);
  let ran = false;
  await assert.rejects(meterCanonicalSandbox('software-agent-command', { timeoutMs: 80_000 }, async () => { ran = true; }, d), ResourceExhaustedError);
  assert.equal(ran, false);
});

test('no admitted attempt means the call is not metered to anyone', async () => {
  const { d, ledger } = deps({ attempt: null });
  assert.equal(await meterCanonicalSandbox('software-agent-command', { timeoutMs: 1000 }, async () => 'ok', d), 'ok');
  assert.equal(ledger.reserved.length, 0);
});

test('remote worker run: the verified owner and run are charged the worker-measured seconds, with worker and memory limit recorded', async () => {
  const { d, ledger } = deps();
  const out = await meterRemoteWorkerRun({ userId: owner, runId: run }, { timeoutMs: 120_000, memoryMb: 1024, worker: 'remote-worker' }, async () => ({ durationMs: 2_300, exitCode: 0 }), d);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(ledger.reserved, [{ category: 'sandbox_compute_seconds', units: 120, runId: run }]);
  assert.deepEqual(ledger.settled, [3], 'the worker reported 2.3 s, rounded up to whole seconds');
  assert.deepEqual(ledger.resources, ['remote-worker;mem=1024MB']);
});

test('remote worker run: a missing duration falls back to elapsed time, and a throw is still settled once', async () => {
  const { d, ledger } = deps();
  await meterRemoteWorkerRun({ userId: owner, runId: run }, { timeoutMs: 5_000, memoryMb: 512, worker: 'w' }, async () => ({}), d);
  await assert.rejects(meterRemoteWorkerRun({ userId: owner, runId: run }, { timeoutMs: 5_000, memoryMb: 512, worker: 'w' }, async () => { throw new Error('boom'); }, d), /boom/);
  assert.equal(ledger.settled.length, 2);
});

test('remote worker run: no owner, or metering off, is a straight call; an exhausted allowance refuses before the worker is called', async () => {
  const off = deps({ enabled: false });
  assert.equal((await meterRemoteWorkerRun({ userId: owner, runId: run }, { timeoutMs: 1000, memoryMb: 64, worker: 'w' }, async () => ({ durationMs: 1 }), off.d)).durationMs, 1);
  assert.equal(off.ledger.reserved.length, 0);
  const on = deps();
  await meterRemoteWorkerRun(undefined, { timeoutMs: 1000, memoryMb: 64, worker: 'w' }, async () => ({ durationMs: 1 }), on.d);
  assert.equal(on.ledger.reserved.length, 0);
  const capped = deps({ caps: { sandbox_compute_seconds: 10 } });
  let called = false;
  await assert.rejects(meterRemoteWorkerRun({ userId: owner, runId: run }, { timeoutMs: 60_000, memoryMb: 1024, worker: 'w' }, async () => { called = true; return {}; }, capped.d), ResourceExhaustedError);
  assert.equal(called, false);
});

test('the resource label carries only safe characters and the memory limit', () => {
  assert.equal(remoteWorkerResourceLabel('xroga sandbox/worker', 1024.7), 'xrogasandboxworker;mem=1024MB');
});
