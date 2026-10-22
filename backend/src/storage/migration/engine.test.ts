import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { sha256Hex } from '../integrity.js';
import { MemoryObjectStore } from '../memoryObjectStore.js';
import { defaultPolicyConfig } from '../policy.js';
import { MemoryStorageRepository } from '../repository.js';
import { StorageService } from '../storageService.js';
import { MigrationEngine } from './engine.js';
import { MemoryLedger } from './ledger.js';
import { LegacyR2Source, SupabaseStorageSource, SECRET_BUCKETS, LocalMediaCacheSource } from './sources.js';
import { NotApprovedError, type Item } from './types.js';
import { approve, TEST_APPROVAL } from '../testing/approvals.js';

const LEGACY = 'xroga-assets';
const DEST = 'xroga-drive-test';

function setup(opts: { files?: Array<{ owner?: string | null; name: string; body: Buffer }> } = {}) {
  const clock = { t: Date.parse('2026-10-22T10:00:00Z') };
  const now = () => new Date(clock.t);
  const legacy = new MemoryObjectStore(() => clock.t);
  const dest = new MemoryObjectStore(() => clock.t);
  const repo = new MemoryStorageRepository(now);
  const ledger = new MemoryLedger(now);
  const drive = new StorageService({ repo, store: dest, bucket: DEST, policy: defaultPolicyConfig({}), now });
  const autoApprove = new Set<string>();
  const alice = randomUUID(), bob = randomUUID();
  const seeded: Array<{ key: string; body: Buffer; owner: string | null }> = [];
  const files = opts.files ?? [
    { owner: alice, name: '1700000000000-photo.png', body: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50, 1)]) },
    { owner: alice, name: '1700000000001-notes.txt', body: Buffer.from('alice notes') },
    { owner: bob, name: '1700000000002-report.pdf', body: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(40, 2)]) },
  ];
  for (const f of files) {
    const key = f.owner ? `users/${f.owner}/${f.name}` : `weird/${f.name}`;
    legacy.seed(LEGACY, key, f.body); seeded.push({ key, body: f.body, owner: f.owner ?? null });
  }
  const source = new LegacyR2Source(legacy, LEGACY, '');
  const engine = (worker = 'w1', extra: Partial<ConstructorParameters<typeof MigrationEngine>[0]> = {}) =>
    (() => {
      const eng = new MigrationEngine({ ledger, source, drive, destRepo: repo, worker, now, approval: TEST_APPROVAL, ...extra });
      const plan = eng.dryRun.bind(eng);
      // test convenience: an operator approves the copy after reading each fresh dry run (real signatures, real verification)
      eng.dryRun = async (id: string) => { const r = await plan(id); if (autoApprove.has(id)) await approve(ledger, id, 'copy', { now: clock.t }); return r; };
      return eng;
    })();
  const job = async (mode: 'dry_run' | 'copy' = 'copy', approveCopy = true) => {
    const j = await ledger.createJob({ name: 't', sourceProvider: 'legacy_r2', destinationBucket: DEST, mode, createdBy: 'test' });
    if (approveCopy) autoApprove.add(j.id);
    return j;
  };
  const snapshotLegacy = () => new Map([...legacy.objects].map(([k, v]) => [k, sha256Hex(v.body)]));
  return { clock, legacy, dest, repo, ledger, drive, engine, job, alice, bob, seeded, snapshotLegacy, source };
}

const statuses = async (s: ReturnType<typeof setup>, jobId: string) => {
  const items = await s.ledger.listItems(jobId, null, 1000);
  return Object.fromEntries(['VERIFIED', 'COPIED', 'FAILED', 'BLOCKED', 'SKIPPED', 'MISSING_SOURCE', 'SOURCE_CHANGED', 'CORRUPT_DESTINATION', 'ELIGIBLE', 'DISCOVERED', 'COPYING'].map((st) => [st, items.filter((i) => i.status === st).length]));
};

describe('migration: safety gates', () => {
  it('discover and dry-run read the source and classify but write nothing to the destination', async () => {
    const s = setup(); const j = await s.job('dry_run', false);
    const e = s.engine();
    const d = await e.discover(j.id);
    assert.equal(d.inserted, 3);
    const plan = await e.dryRun(j.id);
    assert.equal(plan.eligible, 3);
    assert.equal(s.dest.objects.size, 0);
    assert.equal(s.repo.objects.size, 0);
    assert.equal(s.dest.calls.filter((c) => c === 'put' || c === 'putStream').length, 0);
  });
  it('copy is refused for a dry-run job and for an unapproved job', async () => {
    const s = setup();
    const dry = await s.job('dry_run', true);
    await s.engine().discover(dry.id); await s.engine().dryRun(dry.id);
    await assert.rejects(s.engine().copy(dry.id), NotApprovedError);
    const unapproved = await s.ledger.createJob({ name: 'u', sourceProvider: 'legacy_r2', destinationBucket: DEST, mode: 'copy', createdBy: 't' });
    await assert.rejects(s.engine().copy(unapproved.id), (e: NotApprovedError) => e.stage === 'copy');
    assert.equal(s.dest.objects.size, 0);
  });
  it('read-new and freeze-old need their own approvals; legacy deletion is not implemented at all', async () => {
    const s = setup(); const j = await s.job();
    const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id); await e.copy(j.id); await e.verify(j.id);
    await assert.rejects(e.readNew(j.id), (x: NotApprovedError) => x.stage === 'read_new');
    await assert.rejects(e.freezeOld(j.id), (x: NotApprovedError) => x.stage === 'freeze_old');
    await approve(s.ledger, j.id, 'delete', { now: s.clock.t });
    await assert.rejects(e.deleteLegacy(j.id), (x: NotApprovedError) => x.stage === 'delete-not-implemented');
    const m = await e.deletionManifest(j.id);
    assert.equal(m.deletesAnything, false);
    assert.equal(s.legacy.objects.size, 3, 'sources untouched');
  });
  it('the secret OAuth-token bucket can never be a migration source', () => {
    assert.ok(SECRET_BUCKETS.has('xroga-github-tokens'));
    assert.throws(() => new SupabaseStorageSource({ list: async () => [], download: async () => null }, 'xroga-github-tokens'), /secret bucket/);
  });
});

describe('migration: end to end', () => {
  it('copies, verifies SHA-256, reconciles honest counts, and leaves every source object byte-identical', async () => {
    const s = setup(); const before = s.snapshotLegacy(); const j = await s.job();
    const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id);
    const c = await e.copy(j.id);
    assert.equal(c.copied, 3);
    const v = await e.verify(j.id);
    assert.equal(v.verified, 3);
    const r = await e.reconcile(j.id);
    assert.deepEqual([r.discovered, r.eligible === 0, r.copied, r.sha256Verified, r.failed, r.corruptDestinations, r.metadataMismatches, r.consistent], [3, true, 3, 3, 0, 0, 0, true]);
    assert.equal(r.retainedForRollback, 3);
    assert.deepEqual(s.snapshotLegacy(), before);
    // every destination is a READY canonical object, owned by the right tenant, with the source's hash
    for (const it of await s.ledger.listItems(j.id, null, 10)) {
      const o = (await s.repo.getObject(it.destinationObjectId!))!;
      const src = s.seeded.find((x) => x.key === it.sourceId)!;
      assert.equal(o.state, 'READY');
      assert.equal(o.ownerUserId, src.owner);
      assert.equal(o.tenantId, src.owner);
      assert.equal(o.sha256Verified, sha256Hex(src.body));
      assert.equal(o.migrationJobId, j.id);
    }
    // usage accounted for each tenant, none enforced
    assert.equal((await s.repo.getUsage(s.alice)).committedBytes, s.seeded.filter((x) => x.owner === s.alice).reduce((a, x) => a + x.body.length, 0));
  });

  it('is idempotent: replaying every phase creates no duplicates and changes nothing', async () => {
    const s = setup(); const j = await s.job(); const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id); await e.copy(j.id); await e.verify(j.id);
    const objs = s.repo.objects.size, destObjs = s.dest.objects.size;
    const again = await e.discover(j.id);
    assert.equal(again.inserted, 0);
    await e.dryRun(j.id);
    const c2 = await e.copy(j.id); assert.equal(c2.claimed, 0);
    await e.verify(j.id);
    assert.equal(s.repo.objects.size, objs); assert.equal(s.dest.objects.size, destObjs);
    // a second job over the same sources adopts the same items rather than creating new destinations
    const j2 = await s.job();
    const d2 = await e.discover(j2.id);
    assert.equal(d2.inserted, 0); assert.equal(d2.unchanged, 3);
    assert.equal(s.repo.objects.size, objs);
  });

  it('resumes discovery from the persisted cursor after a restart', async () => {
    const files = Array.from({ length: 7 }, (_, i) => ({ owner: randomUUID(), name: `170000000000${i}-f${i}.txt`, body: Buffer.from(`file ${i}`) }));
    const s = setup({ files }); const j = await s.job();
    const first = await s.engine('crashy').discover(j.id, { pageSize: 3, maxPages: 1 });
    assert.equal(first.inserted, 3); assert.equal(first.done, false);
    const second = await s.engine('fresh-process').discover(j.id, { pageSize: 3 });
    assert.equal(second.inserted, 4); assert.equal(second.done, true);
    assert.equal((await s.ledger.listItems(j.id, null, 100)).length, 7);
  });

  it('classifies unknown owners, unparseable keys and oversize objects as BLOCKED with a reason, not as success', async () => {
    const s = setup({ files: [{ owner: randomUUID(), name: '1700000000000-ok.txt', body: Buffer.from('ok') }, { owner: null, name: 'stray.txt', body: Buffer.from('stray') }] });
    const j = await s.job(); const e = s.engine('w', { maxObjectBytes: 1 });
    await e.discover(j.id); const plan = await e.dryRun(j.id);
    assert.equal(plan.eligible, 0);
    assert.deepEqual(plan.blocked, { EXCEEDS_MAX_OBJECT_BYTES: 1, UNKNOWN_OWNER: 1 });
    await e.copy(j.id);
    assert.equal(s.dest.objects.size, 0);
    const r = await e.reconcile(j.id);
    assert.equal(r.copied, 0); assert.equal(r.consistent, true);
  });

  it('ephemeral cache files are skipped unless the operator opts in, and are counted honestly', async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const root = await mkdtemp(path.join(tmpdir(), 'xroga-cache-'));
    const owner = randomUUID();
    await mkdir(path.join(root, 'users', owner), { recursive: true });
    await writeFile(path.join(root, 'users', owner, '1-video.mp4'), Buffer.from('cached video bytes'));
    await writeFile(path.join(root, 'users', owner, '1-video.mp4.meta'), 'video/mp4');
    const s = setup({ files: [] });
    const src = new LocalMediaCacheSource(root);
    const mk = (includeEphemeral: boolean) => new MigrationEngine({ ledger: s.ledger, source: src, drive: s.drive, destRepo: s.repo, worker: 'w', includeEphemeral, approval: TEST_APPROVAL });
    const j = await s.ledger.createJob({ name: 'c', sourceProvider: 'local_media_cache', destinationBucket: DEST, mode: 'copy', createdBy: 't' });
    await mk(false).discover(j.id);
    const plan = await mk(false).dryRun(j.id);
    assert.deepEqual(plan.skipped, { EPHEMERAL_CACHE: 1 });
    await approve(s.ledger, j.id, 'copy');
    await mk(false).copy(j.id);
    assert.equal(s.dest.objects.size, 0);
  });
});

describe('migration: fault injection', () => {
  it('destination temporarily unavailable: item FAILED with backoff, then succeeds on retry; nothing is half-READY', async () => {
    const s = setup(); const j = await s.job(); const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id);
    s.dest.failNext('put', 'throw');
    const c1 = await e.copy(j.id);
    assert.equal(c1.failed, 1); assert.equal(c1.copied, 2);
    assert.deepEqual((await statuses(s, j.id)).FAILED, 1);
    assert.equal((await e.copy(j.id)).claimed, 0, 'backoff holds the failed item back');
    s.clock.t += 5 * 60_000;
    const c2 = await e.copy(j.id);
    assert.equal(c2.copied, 1);
    await e.verify(j.id);
    const r = await e.reconcile(j.id);
    assert.equal(r.sha256Verified, 3); assert.equal(r.failed, 0);
    for (const o of s.repo.objects.values()) assert.equal(o.state, 'READY');
  });

  it('timeout AFTER a successful destination write is not trusted until read-back verifies it', async () => {
    const s = setup(); const j = await s.job(); const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id);
    s.dest.failNext('put', 'after-write');
    const c = await e.copy(j.id);
    assert.equal(c.failed + c.copied, 3);
    s.clock.t += 5 * 60_000; await e.copy(j.id); await e.verify(j.id);
    const r = await e.reconcile(j.id);
    assert.equal(r.sha256Verified, 3);
    assert.equal(s.dest.objects.size, 3, 'no duplicate objects from the retried write');
  });

  it('process killed after the destination upload but before the ledger commit: a second worker finishes without re-uploading', async () => {
    const s = setup(); const j = await s.job();
    await s.engine().discover(j.id); await s.engine().dryRun(j.id);
    let dead = false;
    const orig = s.ledger.updateItem.bind(s.ledger);
    s.ledger.updateItem = async (...a: Parameters<typeof orig>) => { if (dead) throw new Error('process killed'); return orig(...a); };
    const e1 = s.engine('worker-1');
    // kill the process at the first ledger write that follows an upload
    const origPut = s.dest.putStream.bind(s.dest);
    s.dest.putStream = async (...a: Parameters<typeof origPut>) => { const r = await origPut(...a); dead = true; return r; };
    await assert.rejects(e1.copy(j.id, { concurrency: 1, limit: 1 }), /process killed/);
    dead = false; s.dest.putStream = origPut;
    const stuck = (await s.ledger.listItems(j.id, ['COPYING'], 10));
    assert.equal(stuck.length, 1);
    assert.equal(s.dest.objects.size, 1, 'the upload really happened');
    const putsBefore = s.dest.calls.filter((c) => c === 'putStream').length;
    s.clock.t += 10 * 60_000; // lease expires
    const c = await s.engine('worker-2').copy(j.id);
    assert.equal(c.reused, 1, 'existing READY destination adopted');
    assert.equal(c.copied, 2);
    assert.equal(s.dest.calls.filter((x) => x === 'putStream').length, putsBefore + 2, 'only the two remaining items were uploaded');
    await s.engine('worker-2').verify(j.id);
    assert.equal((await s.engine('worker-2').reconcile(j.id)).sha256Verified, 3);
    assert.equal(s.dest.objects.size, 3);
  });

  it('DB commit failure while recording COPIED is retried and converges on one destination', async () => {
    const s = setup(); const j = await s.job(); const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id);
    s.ledger.failNext = 'updateItem:COPIED';
    const c1 = await e.copy(j.id);
    assert.equal(c1.failed, 1);
    s.clock.t += 5 * 60_000;
    const c2 = await e.copy(j.id);
    assert.equal(c2.reused, 1);
    await e.verify(j.id);
    assert.equal((await e.reconcile(j.id)).sha256Verified, 3);
    assert.equal(s.dest.objects.size, 3);
  });

  it('destination written with corrupted bytes: detected against the SOURCE hash, destination marked CORRUPT, never READY, source preserved', async () => {
    const s = setup(); const before = s.snapshotLegacy(); const j = await s.job(); const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id);
    s.dest.corruptNextStreamWrite = true;
    const c = await e.copy(j.id);
    assert.equal(c.corrupt, 1);
    const bad = (await s.ledger.listItems(j.id, ['CORRUPT_DESTINATION'], 10))[0];
    assert.equal((await s.repo.getObject(bad.destinationObjectId!))!.state, 'CORRUPT');
    assert.deepEqual(s.snapshotLegacy(), before);
    await e.verify(j.id);
    const r = await e.reconcile(j.id);
    assert.equal(r.corruptDestinations, 1); assert.equal(r.sha256Verified, 2);
  });

  it('destination corrupted after copy is caught by VERIFY', async () => {
    const s = setup(); const j = await s.job(); const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id); await e.copy(j.id);
    const victim = (await s.ledger.listItems(j.id, ['COPIED'], 10))[1];
    s.dest.corrupt(DEST, victim.destinationKey!);
    const v = await e.verify(j.id);
    assert.equal(v.corrupt, 1); assert.equal(v.verified, 2);
    assert.equal((await s.repo.getObject(victim.destinationObjectId!))!.state, 'CORRUPT');
    const r = await e.reconcile(j.id);
    assert.equal(r.corruptDestinations, 1);
  });

  it('destination object deleted after copy: VERIFY reports it missing, never VERIFIED', async () => {
    const s = setup(); const j = await s.job(); const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id); await e.copy(j.id);
    const victim = (await s.ledger.listItems(j.id, ['COPIED'], 10))[0];
    s.dest.remove(DEST, victim.destinationKey!);
    const v = await e.verify(j.id);
    assert.equal(v.missingDestination, 1);
  });

  it('source missing or changed mid-migration is reported, never counted as migrated; re-discovery recopies the new bytes', async () => {
    const s = setup(); const j = await s.job(); const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id);
    const [gone, changed] = s.seeded;
    s.legacy.remove(LEGACY, gone.key);
    s.legacy.seed(LEGACY, changed.key, Buffer.concat([changed.body, Buffer.from(' EDITED')]));
    const c = await e.copy(j.id);
    assert.equal(c.missing, 1); assert.equal(c.sourceChanged, 1); assert.equal(c.copied, 1);
    let r = await e.reconcile(j.id);
    assert.deepEqual([r.missingSources, r.sourceChanged, r.copied], [1, 1, 1]);
    assert.equal(r.consistent, true);
    const re = await e.discover(j.id);
    assert.equal(re.changed, 1);
    await e.dryRun(j.id);
    const c2 = await e.copy(j.id);
    assert.equal(c2.copied, 1);
    await e.verify(j.id);
    r = await e.reconcile(j.id);
    assert.equal(r.sha256Verified, 2); assert.equal(r.missingSources, 1);
    const item = (await s.ledger.getItemBySource('legacy_r2', changed.key))!;
    assert.equal(item.sourceSha256, sha256Hex(Buffer.concat([changed.body, Buffer.from(' EDITED')])));
  });

  it('two workers running at once copy each source exactly once', async () => {
    const files = Array.from({ length: 12 }, (_, i) => ({ owner: randomUUID(), name: `17000000000${String(i).padStart(2, '0')}-f${i}.txt`, body: Buffer.from(`body ${i}`) }));
    const s = setup({ files }); const j = await s.job();
    await s.engine().discover(j.id); await s.engine().dryRun(j.id);
    const [a, b] = await Promise.all([s.engine('A').copy(j.id, { concurrency: 3 }), s.engine('B').copy(j.id, { concurrency: 3 })]);
    assert.equal(a.copied + b.copied, 12);
    assert.equal(s.dest.objects.size, 12);
    assert.equal(s.dest.calls.filter((c) => c === 'putStream').length, 12);
    await s.engine().verify(j.id);
    assert.equal((await s.engine().reconcile(j.id)).sha256Verified, 12);
  });

  it('a worker that lost its lease cannot overwrite the ledger', async () => {
    const s = setup(); const j = await s.job(); const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id);
    const [claimed] = await s.ledger.claim(j.id, 'old-worker', 1, 60);
    s.clock.t += 120_000;
    const [stolen] = await s.ledger.claim(j.id, 'new-worker', 1, 60);
    assert.equal(stolen.id, claimed.id);
    assert.equal(await s.ledger.updateItem(claimed.id, { status: 'COPIED' }, { worker: 'old-worker' }), null);
  });

  it('retries are bounded: a persistently failing item ends BLOCKED(MAX_ATTEMPTS), not an infinite loop', async () => {
    const s = setup({ files: [{ owner: randomUUID(), name: '1700000000000-x.txt', body: Buffer.from('x') }] });
    const j = await s.job(); const e = s.engine('w', { maxAttempts: 2 });
    await e.discover(j.id); await e.dryRun(j.id);
    for (let i = 0; i < 6; i++) { s.dest.failNext('put', 'throw'); await e.copy(j.id); s.clock.t += 20 * 60_000; }
    const it = (await s.ledger.listItems(j.id, null, 5))[0];
    assert.equal(it.status, 'BLOCKED'); assert.equal(it.skipReason, 'MAX_ATTEMPTS');
    assert.equal(s.dest.objects.size, 0);
  });
});

describe('migration: read mode switch and rollback', () => {
  async function ready() {
    const s = setup(); const j = await s.job(); const e = s.engine();
    await e.discover(j.id); await e.dryRun(j.id); await e.copy(j.id); await e.verify(j.id);
    await approve(s.ledger, j.id, 'read_new', { now: s.clock.t }); await approve(s.ledger, j.id, 'freeze_old', { now: s.clock.t });
    return { s, j, e };
  }
  it('switches only VERIFIED items, rolls back idempotently, and never touches objects or newer writes', async () => {
    const { s, j, e } = await ready();
    const bad = (await s.ledger.listItems(j.id, ['VERIFIED'], 10))[0];
    await s.ledger.updateItem(bad.id, { status: 'CORRUPT_DESTINATION' });
    const r1 = await e.readNew(j.id);
    assert.equal(r1.switched, 2);
    const items = await s.ledger.listItems(j.id, null, 10);
    assert.equal(items.find((i: Item) => i.id === bad.id)!.readMode, 'legacy', 'unverified item is never switched');
    // a customer write that happens after cutover
    const post = await s.drive.putServerObject({ userId: s.alice, tenantId: s.alice }, { objectClass: 'artifact', filename: 'after-cutover.txt', contentType: 'text/plain', body: Buffer.from('written after cutover') });
    const objectsBefore = s.repo.objects.size, destBefore = s.dest.objects.size;
    const rb1 = await e.rollbackReadMode(j.id);
    const rb2 = await e.rollbackReadMode(j.id);
    assert.equal(rb1.reverted, 2); assert.equal(rb2.reverted, 0);
    assert.equal(s.repo.objects.size, objectsBefore); assert.equal(s.dest.objects.size, destBefore);
    assert.equal((await s.repo.getObject(post.id))!.state, 'READY');
    assert.equal(s.legacy.objects.size, 3);
    assert.equal((await e.reconcile(j.id)).readingFromNew, 0);
    // switch again after rollback works (rollback is not destructive)
    assert.equal((await e.readNew(j.id)).switched, 2);
  });
  it('FREEZE_OLD is a ledger marker only and the deletion manifest deletes nothing', async () => {
    const { s, j, e } = await ready();
    await e.readNew(j.id);
    const before = s.snapshotLegacy();
    const f = await e.freezeOld(j.id);
    assert.equal(f.frozen, 3);
    const m = await e.deletionManifest(j.id);
    assert.equal(m.candidates.length, 3); assert.equal(m.deletesAnything, false);
    assert.deepEqual(s.snapshotLegacy(), before);
  });
  it('the migrated object stays tenant-bound: another tenant cannot read it', async () => {
    const { s, j, e } = await ready();
    await e.readNew(j.id);
    const aliceItem = (await s.ledger.listItems(j.id, null, 10)).find((i) => i.ownerUserId === s.alice)!;
    await assert.rejects(s.drive.getDownload({ userId: s.bob, tenantId: s.bob }, aliceItem.destinationObjectId!), (x: { code: string }) => x.code === 'NOT_FOUND');
    assert.ok((await s.drive.getDownload({ userId: s.alice, tenantId: s.alice }, aliceItem.destinationObjectId!)).url);
  });
});
