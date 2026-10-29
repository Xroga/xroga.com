import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { engineeringMeterFor, meterConfigFromEnv, ResourceExhaustedError, ResourceMeter, type MeterConfig } from './resourceMeter.js';
import { ResourceLedgerError, type ReserveOutcome, type ResourceLedger, type SettleOutcome } from './resourceLedger.js';

const run = randomUUID();

/** A ledger that enforces a cap in memory, to test the meter's behaviour (the database semantics have their own real-PostgreSQL tests). */
class FakeLedger implements ResourceLedger {
  used = 0; holds = new Map<string, { units: number; settled?: number }>(); settles: number[] = []; failReserve = false; failSettle = false; reserveCalls = 0;
  async reserve(input: { units: number; cap: number }): Promise<ReserveOutcome> {
    this.reserveCalls++;
    if (this.failReserve) throw new ResourceLedgerError('RESOURCE_UNAVAILABLE', 'down');
    if (this.used + input.units > input.cap) return { state: 'exhausted', used: this.used, cap: input.cap };
    const id = randomUUID(); this.holds.set(id, { units: input.units }); this.used += input.units;
    return { state: 'reserved', reservationId: id };
  }
  async settle(id: string, actual: number): Promise<SettleOutcome> {
    if (this.failSettle) throw new ResourceLedgerError('RESOURCE_UNAVAILABLE', 'down');
    const hold = this.holds.get(id)!; this.used += actual - hold.units; hold.settled = actual; this.settles.push(actual);
    return { state: 'settled', settledUnits: actual };
  }
  async release() { return { state: 'released' as const }; }
}

const on = (caps: MeterConfig['caps'] = {}): MeterConfig => ({ enabled: true, caps, windowSeconds: 86_400 });
const input = { category: 'sandbox_compute_seconds' as const, runId: run, estimateUnits: 30 };

test('configuration: off by default, caps and window come from the environment, a bad value is refused loudly', () => {
  assert.equal(meterConfigFromEnv({}).enabled, false);
  const c = meterConfigFromEnv({ XROGA_ENGINEERING_METERING: '1', XROGA_ENGINEERING_CAP_SANDBOX_SECONDS: '3600', XROGA_ENGINEERING_CAP_WINDOW_SECONDS: '7200' });
  assert.deepEqual(c, { enabled: true, caps: { sandbox_compute_seconds: 3600 }, windowSeconds: 7200 });
  assert.equal(meterConfigFromEnv({ XROGA_ENGINEERING_METERING: '1' }).caps.storage_bytes, undefined, 'no cap means no cap, not a made-up one');
  for (const bad of ['abc', '0', '-5']) assert.throws(() => meterConfigFromEnv({ XROGA_ENGINEERING_CAP_BROWSER_SECONDS: bad }), /must be a positive number/);
  assert.throws(() => meterConfigFromEnv({ XROGA_ENGINEERING_CAP_WINDOW_SECONDS: '5' }), /between 60 seconds and 31 days/);
});

test('metering off: the work runs and the ledger is never touched', async () => {
  const ledger = new FakeLedger();
  assert.equal(engineeringMeterFor('u', meterConfigFromEnv({}), () => ledger), null);
  const meter = new ResourceMeter(ledger, { enabled: false, caps: {}, windowSeconds: 86_400 });
  assert.equal(await meter.measure(input, async () => 'done'), 'done'); assert.equal(ledger.reserveCalls, 0);
});

test('record-only (no cap): usage is measured and settled, and nothing is ever refused', async () => {
  const ledger = new FakeLedger(); const meter = new ResourceMeter(ledger, on());
  for (let i = 0; i < 3; i++) await meter.measure(input, async () => 'ok', () => 1000);
  assert.deepEqual(ledger.settles, [1000, 1000, 1000]);
});

test('enforced cap: reserved before the work, settled with measured units, refused once exhausted without starting the work', async () => {
  const ledger = new FakeLedger(); const meter = new ResourceMeter(ledger, on({ sandbox_compute_seconds: 100 }));
  await meter.measure(input, async () => 'a', () => 60);
  assert.equal(ledger.used, 60, 'the held estimate was replaced by the measured 60');
  let started = false;
  await assert.rejects(meter.measure({ ...input, estimateUnits: 50 }, async () => { started = true; return 'b'; }), (e: unknown) => e instanceof ResourceExhaustedError && e.cap === 100 && e.used === 60);
  assert.equal(started, false, 'an exhausted allowance never starts the work');
});

test('work that throws is still charged what it used, and the error is not swallowed', async () => {
  const ledger = new FakeLedger(); const meter = new ResourceMeter(ledger, on());
  await assert.rejects(meter.measure(input, async () => { throw new Error('boom'); }, () => 7), /boom/);
  assert.deepEqual(ledger.settles, [7]);
});

test('ledger outage: an enforced category fails closed, a record-only one fails open with a warning', async () => {
  const warnings: string[] = [];
  const down = new FakeLedger(); down.failReserve = true;
  const enforced = new ResourceMeter(down, on({ sandbox_compute_seconds: 100 }), (m) => warnings.push(m));
  let ran = false;
  await assert.rejects(enforced.measure(input, async () => { ran = true; }), /./);
  assert.equal(ran, false);
  const open = new ResourceMeter(down, on(), (m) => warnings.push(m));
  assert.equal(await open.measure(input, async () => 'still runs'), 'still runs');
  assert.ok(warnings.some((w) => /not recorded/.test(w)));
});

test('a settlement failure never fails the work; the hold is left for the sweep', async () => {
  const ledger = new FakeLedger(); ledger.failSettle = true; const warnings: string[] = [];
  const meter = new ResourceMeter(ledger, on({ sandbox_compute_seconds: 100 }), (m) => warnings.push(m));
  assert.equal(await meter.measure(input, async () => 'ok'), 'ok');
  assert.ok(warnings.some((w) => /sweep/.test(w)));
});

test('a run id that is not a real run identity is not metered rather than mis-billed', async () => {
  const ledger = new FakeLedger(); const meter = new ResourceMeter(ledger, on({ sandbox_compute_seconds: 100 }));
  assert.equal(await meter.measure({ ...input, runId: 'logical-run' }, async () => 'ok'), 'ok'); assert.equal(ledger.reserveCalls, 0);
});
