import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdmissionController, AdmissionError } from './admission.js';

const opts = { maxConcurrent: 3, maxPerTenant: 2, maxQueuedPerTenant: 4, maxQueuedTotal: 8 };
const tick = () => new Promise((r) => setImmediate(r));
const code = (c: string) => (e: unknown) => e instanceof AdmissionError && e.code === c;

describe('browser job admission', () => {
  it('grants up to the global cap and queues the rest', async () => {
    const a = new AdmissionController({ ...opts, maxPerTenant: 3 });
    const r1 = await a.acquire('t1'); const r2 = await a.acquire('t2'); const r3 = await a.acquire('t3');
    let granted = false;
    const p = a.acquire('t4').then((r) => { granted = true; return r; });
    await tick();
    assert.equal(granted, false);
    assert.deepEqual([a.stats().running, a.stats().queued], [3, 1]);
    r1();
    const r4 = await p;
    assert.equal(a.stats().running, 3);
    [r2, r3, r4].forEach((r) => r());
    assert.deepEqual([a.stats().running, a.stats().queued], [0, 0]);
  });

  it('one tenant can never hold more than its share, even with idle capacity', async () => {
    const a = new AdmissionController(opts);
    const r1 = await a.acquire('noisy'); const r2 = await a.acquire('noisy');
    let third = false;
    const p = a.acquire('noisy').then((r) => { third = true; return r; });
    await tick();
    assert.equal(third, false, 'a third slot stays free but the tenant cap holds');
    assert.equal(a.stats().running, 2);
    const other = await a.acquire('quiet'); // the free slot is available to someone else immediately
    assert.equal(a.stats().running, 3);
    r1(); const r3 = await p;
    [r2, r3, other].forEach((r) => r());
  });

  it('a noisy tenant with a deep backlog cannot starve a quiet tenant', async () => {
    const a = new AdmissionController({ maxConcurrent: 2, maxPerTenant: 2, maxQueuedPerTenant: 50, maxQueuedTotal: 100 });
    const order: string[] = [];
    const releases: Array<() => void> = [];
    const run = (tenant: string) => a.acquire(tenant).then((r) => { order.push(tenant); releases.push(r); });
    const first = [run('noisy'), run('noisy')]; // occupy both slots
    await Promise.all(first);
    for (let i = 0; i < 20; i++) void run('noisy');       // a large backlog
    const quiet = run('quiet');                            // arrives after all of it
    await tick();
    releases.shift()!();                                   // one slot frees
    await quiet;
    assert.equal(order.at(-1), 'quiet', 'the quiet tenant is served next, ahead of the earlier noisy backlog');
    assert.equal(order.indexOf('quiet'), 2);
  });

  it('waiting tenants are served fewest-running first, then by who has waited longest', async () => {
    const a = new AdmissionController({ maxConcurrent: 3, maxPerTenant: 3, maxQueuedPerTenant: 10, maxQueuedTotal: 30 });
    const held = [await a.acquire('A'), await a.acquire('A'), await a.acquire('B')]; // A runs 2, B runs 1
    const order: string[] = [];
    const rel: Array<() => void> = [];
    const want = (t: string) => a.acquire(t).then((r) => { order.push(t); rel.push(r); });
    void want('A'); void want('B'); void want('C');
    await tick();
    held[0]!(); await tick();            // one slot: C has 0 running, B has 1, A has 1 -> C first
    assert.deepEqual(order, ['C']);
    held[1]!(); await tick();            // A 0 running, B 1, C 1 -> A
    assert.deepEqual(order, ['C', 'A']);
    held[2]!(); await tick();            // B 0 running (its one finished), A 1, C 1 -> B
    assert.deepEqual(order, ['C', 'A', 'B']);
  });

  it('the queue is bounded per tenant and in total: overflow fails fast with a typed error', async () => {
    const a = new AdmissionController({ maxConcurrent: 1, maxPerTenant: 1, maxQueuedPerTenant: 2, maxQueuedTotal: 3 });
    const hold = await a.acquire('t1');
    void a.acquire('t1'); void a.acquire('t1');
    await assert.rejects(a.acquire('t1'), code('QUEUE_FULL'));
    void a.acquire('t2');
    await assert.rejects(a.acquire('t3'), code('QUEUE_FULL'), 'total bound');
    assert.equal(a.stats().queued, 3);
    hold();
  });

  it('a job that is cancelled while waiting leaves the queue and never takes a slot', async () => {
    const a = new AdmissionController({ maxConcurrent: 1, maxPerTenant: 1, maxQueuedPerTenant: 5, maxQueuedTotal: 5 });
    const hold = await a.acquire('t1');
    const ctl = new AbortController();
    const waiting = a.acquire('t2', ctl.signal);
    const behind = a.acquire('t3');
    await tick();
    ctl.abort();
    await assert.rejects(waiting, code('ADMISSION_ABORTED'));
    assert.equal(a.stats().queued, 1);
    hold();
    const r = await behind;
    assert.deepEqual([a.stats().running, a.stats().queued], [1, 0]);
    r();
  });

  it('an already aborted signal is refused before queueing', async () => {
    const a = new AdmissionController(opts);
    const ctl = new AbortController(); ctl.abort();
    await assert.rejects(a.acquire('t1', ctl.signal), code('ADMISSION_ABORTED'));
    assert.deepEqual([a.stats().running, a.stats().queued], [0, 0]);
  });

  it('release is idempotent: a double release cannot free someone else\'s slot', async () => {
    const a = new AdmissionController({ maxConcurrent: 2, maxPerTenant: 2, maxQueuedPerTenant: 5, maxQueuedTotal: 5 });
    const r1 = await a.acquire('t1'); const r2 = await a.acquire('t2');
    r1(); r1(); r1();
    assert.equal(a.stats().running, 1);
    let granted = 0;
    const p1 = a.acquire('t3').then((r) => { granted++; return r; });
    const p2 = a.acquire('t4').then((r) => { granted++; return r; });
    await tick();
    assert.equal(granted, 1, 'only one slot was really free');
    r2();
    await Promise.all([p1, p2]);
    assert.equal(a.stats().running, 2);
  });

  it('rejects nonsense configuration and tenant ids', async () => {
    for (const bad of [{ ...opts, maxConcurrent: 0 }, { ...opts, maxPerTenant: 4 }, { ...opts, maxQueuedPerTenant: 1.5 }, { ...opts, maxQueuedTotal: -1 }]) assert.throws(() => new AdmissionController(bad));
    const a = new AdmissionController(opts);
    await assert.rejects(a.acquire(''));
  });

  it('stress: many tenants, random completion, never exceeds a cap and always drains', async () => {
    const a = new AdmissionController({ maxConcurrent: 4, maxPerTenant: 2, maxQueuedPerTenant: 200, maxQueuedTotal: 1000 });
    let peak = 0; const perTenantPeak = new Map<string, number>(); const cur = new Map<string, number>();
    const jobs = Array.from({ length: 300 }, (_, i) => `tenant-${i % 7}`).map(async (t) => {
      const release = await a.acquire(t);
      const n = (cur.get(t) ?? 0) + 1; cur.set(t, n); perTenantPeak.set(t, Math.max(perTenantPeak.get(t) ?? 0, n));
      peak = Math.max(peak, a.stats().running);
      await new Promise((r) => setTimeout(r, Math.random() * 3));
      cur.set(t, (cur.get(t) ?? 1) - 1); release();
    });
    await Promise.all(jobs);
    assert.ok(peak <= 4, `peak ${peak}`);
    for (const [t, p] of perTenantPeak) assert.ok(p <= 2, `${t} peak ${p}`);
    assert.deepEqual([a.stats().running, a.stats().queued], [0, 0]);
  });
});
