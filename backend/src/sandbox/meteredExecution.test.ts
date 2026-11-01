import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { categoryFor, estimatedSeconds, meterCanonicalSandbox, type MeteredCallDeps } from './meteredExecution.js';
import { ResourceExhaustedError, ResourceMeter, type MeterConfig } from '../ai/resourceMeter.js';
import type { ReserveOutcome, ResourceCategory, ResourceLedger, SettleOutcome } from '../ai/resourceLedger.js';

const owner = randomUUID();
const run = randomUUID();

class RecordingLedger implements ResourceLedger {
  reserved: Array<{ category: ResourceCategory; units: number; runId: string }> = []; settled: number[] = []; used = 0;
  async reserve(i: { category: ResourceCategory; units: number; cap: number; runId: string }): Promise<ReserveOutcome> {
    if (this.used + i.units > i.cap) return { state: 'exhausted', used: this.used, cap: i.cap };
    this.used += i.units; this.reserved.push({ category: i.category, units: i.units, runId: i.runId }); return { state: 'reserved', reservationId: randomUUID() };
  }
  async settle(_id: string, actual: number): Promise<SettleOutcome> { this.settled.push(actual); return { state: 'settled', settledUnits: actual }; }
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
