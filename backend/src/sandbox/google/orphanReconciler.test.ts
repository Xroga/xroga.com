import assert from 'node:assert/strict';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { GceMachineControl, type GceApi, type GceExecutionHandle } from './gceMachineControl.js';
import { MIN_RECORDING_DEADLINE_SECONDS, reconcileUnrecordedAllocations, recordingDeadlineFromEnv, sweepUnrecordedGceAllocations, type OrphanDeps } from './orphanReconciler.js';

const configuration = {
  project: 'synthetic-project', zone: 'us-central1-a', subnet: 'projects/synthetic-project/regions/us-central1/subnetworks/xroga-verify-subnet',
  imageName: 'xroga-exec-synthetic', imageId: '123456789', serviceAccount: 'synthetic-runtime@synthetic-project.iam.gserviceaccount.com',
  admittedImages: [`node@sha256:${'a'.repeat(64)}`],
};
const workerSource = '# Synthetic control source, not a live worker';
const workerDigest = createHash('sha256').update(workerSource).digest('hex');
const NOW = 1_800_000_000;
const DEADLINE = 1800;

type Machine = { id: string; name: string; status: string; serviceAccounts: unknown[]; labels: Record<string, string>; creationTimestamp?: string;
  networkInterfaces: unknown[]; metadata: { items: Array<{ key: string; value: string }> } };

/** A stateful in-memory Compute API: list (paged), get, disk, delete and operations. Hooks let a test change the world between a list and a delete. */
function world() {
  const machines = new Map<string, Machine>();
  const calls: string[] = [];
  let seq = 1_000_000; let pageSize = 500; let deniedDelete = false;
  const add = (over: { ageSeconds?: number | null; labels?: Record<string, string>; drop?: 'labels' | 'expiry' } = {}): GceExecutionHandle => {
    const runtimeId = randomUUID(); const name = 'xroga-exec-' + runtimeId.replaceAll('-', '');
    const owner = randomBytes(20).toString('hex'); const project = randomBytes(20).toString('hex'); const expires = NOW + 600;
    const machine: Machine = {
      id: String(seq++), name, status: 'RUNNING', serviceAccounts: [],
      labels: over.drop === 'labels' ? {} : { 'xroga-runtime': runtimeId, 'xroga-owner': owner, 'xroga-project': project, ...over.labels },
      networkInterfaces: [{ networkIP: '10.90.0.2', subnetwork: 'https://www.googleapis.com/compute/v1/' + configuration.subnet }],
      metadata: { items: [{ key: 'xroga-control-sha256', value: workerDigest }, ...(over.drop === 'expiry' ? [] : [{ key: 'xroga-expires-at', value: String(expires) }])] },
      ...(over.ageSeconds === null ? {} : { creationTimestamp: new Date((NOW - (over.ageSeconds ?? 3600)) * 1000).toISOString() }),
    };
    machines.set(name, machine);
    return { name, instanceId: machine.id, runtimeId, ownerBinding: owner, projectBinding: project, expiresAtEpoch: expires };
  };
  const api: GceApi = {
    async request<T>(o: Parameters<GceApi['request']>[0]) {
      calls.push(`${o.method} ${o.url.replace(/^.*\/projects\/[^/]+/, '')}`);
      const u = new URL(o.url); const path = u.pathname.replace(/^.*\/projects\/[^/]+/, '');
      const fail = (status: number): never => { throw Object.assign(new Error('http'), { response: { status } }); };
      if (path.endsWith('/instances') && o.method === 'GET') {
        const all = [...machines.values()]; const start = Number(u.searchParams.get('pageToken') ?? 0);
        const items = all.slice(start, start + pageSize);
        return { data: { items, ...(start + pageSize < all.length ? { nextPageToken: String(start + pageSize) } : {}) } as T };
      }
      const instance = /\/instances\/(xroga-exec-[a-z0-9-]+)$/.exec(path);
      if (instance && o.method === 'GET') { const m = machines.get(instance[1]!); return m ? { data: m as T } : fail(404); }
      if (instance && o.method === 'DELETE') {
        if (deniedDelete) fail(403);
        // the delete targets whatever holds the name NOW; the control must already have proven it is the machine it meant
        if (!machines.delete(instance[1]!)) fail(404);
        return { data: { name: 'delete-op' } as T };
      }
      if (/\/disks\//.test(path)) return { data: { sourceImageId: configuration.imageId } as T };
      if (/\/operations\//.test(path)) return { data: { status: 'DONE' } as T };
      return fail(404);
    },
  };
  const control = new GceMachineControl(configuration, api, workerSource, async () => undefined);
  return { machines, calls, add, control, setPageSize: (n: number) => { pageSize = n; }, denyDelete: () => { deniedDelete = true; } };
}

const deps = (w: ReturnType<typeof world>, recorded: Set<string> = new Set(), over: Partial<OrphanDeps> = {}): OrphanDeps => ({
  control: w.control, isRecorded: async (h) => recorded.has(h.instanceId), recordingDeadlineSeconds: DEADLINE, nowEpoch: () => NOW, ...over,
});

test('positive control: an old unrecorded machine is destroyed through the real control, and a second run finds nothing to do', async () => {
  const w = world(); const orphan = w.add({ ageSeconds: 4000 });
  const first = await reconcileUnrecordedAllocations(deps(w));
  assert.deepEqual(first.allocations.map((a) => a.outcome), ['deleted']); assert.equal(first.deleted, 1);
  assert.equal(w.machines.has(orphan.name), false);
  const second = await reconcileUnrecordedAllocations(deps(w));
  assert.equal(second.inspected, 0); assert.equal(second.deleted, 0);
});

test('a recorded machine, a recent one and one of unknown age are never touched', async () => {
  const w = world();
  const recorded = w.add({ ageSeconds: 9000 }); const recent = w.add({ ageSeconds: 60 }); const unknown = w.add({ ageSeconds: null });
  const report = await reconcileUnrecordedAllocations(deps(w, new Set([recorded.instanceId])));
  const by = new Map(report.allocations.map((a) => [a.instanceId, a.outcome]));
  assert.equal(by.get(recorded.instanceId), 'skipped_recorded'); assert.equal(by.get(recent.instanceId), 'skipped_recent'); assert.equal(by.get(unknown.instanceId), 'skipped_unknown_age');
  assert.equal(w.machines.size, 3); assert.equal(report.deleted, 0);
  assert.ok(!w.calls.some((c) => c.startsWith('DELETE')), 'no delete was even attempted');
});

test('a machine whose identity is incomplete is reported as unrecognized and never destroyed', async () => {
  const w = world(); w.add({ ageSeconds: 9000, drop: 'labels' }); w.add({ ageSeconds: 9000, drop: 'expiry' });
  const report = await reconcileUnrecordedAllocations(deps(w));
  assert.deepEqual(report.allocations.map((a) => a.outcome), ['unrecognized', 'unrecognized']);
  assert.equal(w.machines.size, 2);
});

test('an uncertain record lookup is never treated as unrecorded', async () => {
  const w = world(); w.add({ ageSeconds: 9000 });
  const report = await reconcileUnrecordedAllocations(deps(w, new Set(), { isRecorded: async () => { throw new Error('database unavailable'); } }));
  assert.deepEqual(report.allocations.map((a) => a.outcome), ['skipped_lookup_failed']); assert.equal(w.machines.size, 1);
});

test('a record that appears between the first check and the delete saves the machine', async () => {
  const w = world(); const m = w.add({ ageSeconds: 9000 }); let asked = 0;
  const report = await reconcileUnrecordedAllocations(deps(w, new Set(), { isRecorded: async () => ++asked >= 2 }));
  assert.deepEqual(report.allocations.map((a) => a.outcome), ['skipped_recorded']); assert.ok(w.machines.has(m.name)); assert.equal(asked, 2);
});

test('a newer machine that took over the slot name after the listing is not deleted, because the control re-verifies identity', async () => {
  const w2 = world(); const stale = w2.add({ ageSeconds: 9000 });
  let replaced = false;
  const original = w2.control.listAllocations.bind(w2.control);
  w2.control.listAllocations = async () => { const listed = await original(); if (!replaced) { replaced = true; w2.machines.delete(stale.name); w2.machines.set(stale.name, { id: '9999999', name: stale.name, status: 'RUNNING', serviceAccounts: [], labels: { 'xroga-runtime': randomUUID(), 'xroga-owner': 'c'.repeat(40), 'xroga-project': 'd'.repeat(40) }, networkInterfaces: [{ networkIP: '10.90.0.3', subnetwork: configuration.subnet }], metadata: { items: [{ key: 'xroga-expires-at', value: String(NOW + 600) }, { key: 'xroga-control-sha256', value: workerDigest }] } } as Machine); } return listed; };
  const report = await reconcileUnrecordedAllocations(deps(w2));
  assert.match(report.allocations[0]!.outcome, /^failed:GCE_RUNTIME_IDENTITY_OR_OWNER_MISMATCH$/);
  assert.equal(w2.machines.get(stale.name)!.id, '9999999', 'the newer machine is still there');
  assert.ok(!w2.calls.some((c) => c.startsWith('DELETE')), 'and nothing was deleted');
});

test('deletions per run are bounded, and the rest are deferred, not forgotten', async () => {
  const w = world(); for (let i = 0; i < 5; i++) w.add({ ageSeconds: 9000 });
  const report = await reconcileUnrecordedAllocations(deps(w, new Set(), { maxDeletions: 3 }));
  assert.equal(report.deleted, 3); assert.equal(report.allocations.filter((a) => a.outcome === 'deferred_limit').length, 2); assert.equal(w.machines.size, 2);
  const next = await reconcileUnrecordedAllocations(deps(w, new Set(), { maxDeletions: 3 }));
  assert.equal(next.deleted, 2); assert.equal(w.machines.size, 0);
});

test('a failed deletion stays visible with its reason and the machine remains', async () => {
  const w = world(); const m = w.add({ ageSeconds: 9000 }); w.denyDelete();
  const report = await reconcileUnrecordedAllocations(deps(w));
  assert.equal(report.failed, 1); assert.match(report.allocations[0]!.outcome, /^failed:GCE_CONTROL_PERMISSION_DENIED$/); assert.ok(w.machines.has(m.name));
});

test('the inventory is read across pages, and one that cannot be completed deletes nothing', async () => {
  const paged = world(); paged.setPageSize(2); for (let i = 0; i < 5; i++) paged.add({ ageSeconds: 100 });
  assert.equal((await reconcileUnrecordedAllocations(deps(paged))).inspected, 5, 'all five were inspected across three pages');
  const huge = world(); huge.setPageSize(1); for (let i = 0; i < 25; i++) huge.add({ ageSeconds: 9000 });
  await assert.rejects(reconcileUnrecordedAllocations(deps(huge, new Set(), { maxDeletions: 100 })), (e: Error & { code?: string }) => e.code === 'GCE_FLEET_INVENTORY_INCOMPLETE');
  assert.equal(huge.machines.size, 25, 'a partial inventory is never acted on');
});

test('only machines Xroga named are considered, and an unsafe deadline is refused', async () => {
  const w = world(); w.machines.set('someone-elses-vm', { id: '5', name: 'someone-elses-vm', status: 'RUNNING', serviceAccounts: [], labels: {}, networkInterfaces: [], metadata: { items: [] } });
  assert.equal((await reconcileUnrecordedAllocations(deps(w))).inspected, 0);
  await assert.rejects(reconcileUnrecordedAllocations(deps(w, new Set(), { recordingDeadlineSeconds: 30 })), /too short/);
  assert.equal(recordingDeadlineFromEnv({}), 1800);
  assert.equal(recordingDeadlineFromEnv({ XROGA_GCE_ORPHAN_DEADLINE_SECONDS: '900' }), 900);
  for (const bad of ['10', String(MIN_RECORDING_DEADLINE_SECONDS - 1), 'abc', '9999999', '600.5']) assert.throws(() => recordingDeadlineFromEnv({ XROGA_GCE_ORPHAN_DEADLINE_SECONDS: bad }), /never swept/);
});

test('the maintenance step is off by default and runs the reconciler only when switched on', async () => {
  const w = world(); const m = w.add({ ageSeconds: 9000 });
  assert.equal(await sweepUnrecordedGceAllocations({}, async () => deps(w)), null);
  assert.ok(w.machines.has(m.name), 'off: nothing happened');
  const report = await sweepUnrecordedGceAllocations({ XROGA_GCE_ORPHAN_SWEEP: '1' }, async () => deps(w));
  assert.equal(report!.deleted, 1); assert.equal(w.machines.has(m.name), false);
});
