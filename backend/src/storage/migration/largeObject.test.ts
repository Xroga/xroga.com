import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { MemoryObjectStore } from '../memoryObjectStore.js';
import { defaultPolicyConfig } from '../policy.js';
import { MemoryStorageRepository } from '../repository.js';
import { StorageService } from '../storageService.js';
import { approve, TEST_APPROVAL } from '../testing/approvals.js';
import { GeneratedSource } from '../testing/generatedSource.js';
import { MigrationEngine } from './engine.js';
import { MemoryLedger } from './ledger.js';

const MiB = 1024 * 1024;
const DEST = 'xroga-drive-test';
const SIZE = 17 * MiB + 3; // 4 parts of 5 MiB, last one 2 MiB + 3 bytes

function setup(sizes: Record<string, number> = { big: SIZE }) {
  const clock = { t: Date.parse('2026-10-22T10:00:00Z') };
  const now = () => new Date(clock.t);
  const src = new GeneratedSource(sizes);
  const dest = new MemoryObjectStore(() => clock.t);
  const repo = new MemoryStorageRepository(now);
  const ledger = new MemoryLedger(now);
  const drive = new StorageService({ repo, store: dest, bucket: DEST, policy: defaultPolicyConfig({}), now });
  const engine = (worker = 'w1') => new MigrationEngine({
    ledger, source: src, drive, destRepo: repo, worker, now, approval: TEST_APPROVAL,
    maxStreamCopyBytes: 6 * MiB, multipart: { partBytes: 5 * MiB, concurrency: 2, partTimeoutMs: 5_000 },
  });
  const prepared = async () => {
    const j = await ledger.createJob({ name: 'big', sourceProvider: 'legacy_r2', destinationBucket: DEST, mode: 'copy', createdBy: 'test' });
    const e = engine();
    await e.discover(j.id); await e.dryRun(j.id); await approve(ledger, j.id, 'copy', { now: clock.t });
    return { j, e };
  };
  return { clock, src, dest, repo, ledger, drive, engine, prepared };
}

const item = async (s: ReturnType<typeof setup>, jobId: string) => (await s.ledger.listItems(jobId, null, 10))[0];

describe('large-object migration (multipart copy)', () => {
  it('routes objects above the single-PUT threshold through bounded multipart and verifies the full SHA-256', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    const c = await e.copy(j.id);
    assert.deepEqual([c.copied, c.failed, c.blocked], [1, 0, 0]);
    assert.equal(s.dest.calls.filter((x) => x === 'putStream').length, 0, 'no whole-object streaming PUT');
    assert.equal(s.dest.calls.filter((x) => x === 'uploadPart').length, 4);
    const v = await e.verify(j.id); assert.equal(v.verified, 1);
    const it = await item(s, j.id);
    assert.equal(it.destinationSha256, s.src.sha256('big'));
    assert.equal((await s.repo.getObject(it.destinationObjectId!))!.state, 'READY');
    assert.equal((await e.reconcile(j.id)).consistent, true);
  });

  it('single-PUT objects below the threshold still use the streaming PUT (no behaviour change)', async () => {
    const s = setup({ small: 2 * MiB }); const { j, e } = await s.prepared();
    await e.copy(j.id);
    assert.equal(s.dest.calls.filter((x) => x === 'putStream').length, 1);
    assert.equal(s.dest.calls.filter((x) => x === 'uploadPart').length, 0);
  });

  it('an interrupted copy resumes the SAME upload and re-uploads only what is missing', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    const orig = s.dest.uploadPart.bind(s.dest);
    let failed = false;
    s.dest.uploadPart = async (b, k, u, n, body) => {
      if (n === 3 && !failed) { failed = true; throw new (await import('../objectStore.js')).ProviderUnavailableError('provider timeout'); }
      return orig(b, k, u, n, body);
    };
    const first = await e.copy(j.id);
    assert.equal(first.failed, 1);
    const it1 = await item(s, j.id);
    assert.equal(it1.status, 'FAILED'); assert.equal(it1.lastErrorClass, 'TRANSIENT');
    const uploadId = (await s.repo.getObject(it1.destinationObjectId ?? [...s.repo.objects.keys()][0]))?.multipartUploadId
      ?? [...s.repo.objects.values()][0].multipartUploadId;
    assert.ok(uploadId, 'upload id persisted for resumption');
    const before = s.dest.calls.filter((x) => x === 'uploadPart').length;
    s.clock.t += 60 * 60_000; // past the retry backoff
    const second = await s.engine('restarted-process').copy(j.id);
    assert.equal(second.copied, 1);
    const after = s.dest.calls.filter((x) => x === 'uploadPart').length - before;
    assert.ok(after < 4, `resume must not re-upload verified parts (uploaded ${after})`);
    assert.equal([...s.repo.objects.values()][0].multipartUploadId, uploadId, 'same upload id reused');
    assert.equal((await e.verify(j.id)).verified, 1);
    assert.equal((await item(s, j.id)).destinationSha256, s.src.sha256('big'));
  });

  it('a timeout AFTER a part was written is not trusted blindly: the retry verifies it by MD5 and reuses it', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    s.dest.failNext('part', 'after-write');
    const first = await e.copy(j.id);
    assert.equal(first.failed + first.copied, 1);
    s.clock.t += 60 * 60_000;
    await s.engine('w2').copy(j.id);
    assert.equal((await e.verify(j.id)).verified, 1);
    assert.equal((await item(s, j.id)).status, 'VERIFIED');
  });

  it('a stored part whose bytes differ from the source is rewritten, not stitched into the object', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    // first attempt dies after part 1 is stored
    let n = 0;
    const orig = s.dest.uploadPart.bind(s.dest);
    s.dest.uploadPart = async (b, k, u, num, body) => { if (++n === 2) throw new (await import('../objectStore.js')).ProviderUnavailableError('boom'); return orig(b, k, u, num, body); };
    await e.copy(j.id);
    s.dest.uploadPart = orig;
    // tamper with stored part 1 (same size, different bytes, a plausible-looking ETag)
    const up = [...s.dest.uploads.values()][0];
    const p1 = up.parts.get(1)!; const evil = Buffer.from(p1.body); evil[0] ^= 0xff;
    up.parts.set(1, { body: evil, etag: `"${createHash('md5').update(evil).digest('hex')}"` }); // a real provider's ETag always describes the stored bytes
    s.clock.t += 60 * 60_000;
    await s.engine('w2').copy(j.id);
    assert.equal((await e.verify(j.id)).verified, 1);
    assert.equal((await item(s, j.id)).destinationSha256, s.src.sha256('big'), 'tampered part must not survive');
  });

  it('a provider that lies (tampered bytes under the old ETag) is still caught by the final read-back: CORRUPT_DESTINATION, never VERIFIED', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    let n = 0;
    const orig = s.dest.uploadPart.bind(s.dest);
    s.dest.uploadPart = async (b, k, u, num, body) => { if (++n === 2) throw new (await import('../objectStore.js')).ProviderUnavailableError('boom'); return orig(b, k, u, num, body); };
    await e.copy(j.id);
    s.dest.uploadPart = orig;
    const p1 = [...s.dest.uploads.values()][0].parts.get(1)!; p1.body = Buffer.from(p1.body); p1.body[0] ^= 0xff; // body changes, ETag does not
    s.clock.t += 60 * 60_000;
    const c = await s.engine('w2').copy(j.id);
    assert.equal(c.corrupt, 1); assert.equal(c.copied, 0);
    const it = await item(s, j.id);
    assert.equal(it.status, 'CORRUPT_DESTINATION');
    assert.notEqual((await s.repo.getObject(it.destinationObjectId!))!.state, 'READY');
  });

  it('wrong part: a provider that acknowledges different bytes is caught as corruption, never COPIED', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    const orig = s.dest.uploadPart.bind(s.dest);
    s.dest.uploadPart = async (b, k, u, num, body) => { const r = await orig(b, k, u, num, body); return num === 2 ? { etag: '"00000000000000000000000000000000"' } : r; };
    const c = await e.copy(j.id);
    assert.equal(c.copied, 0);
    const it = await item(s, j.id);
    assert.notEqual(it.status, 'COPIED'); assert.notEqual(it.status, 'VERIFIED');
    assert.equal(s.dest.objects.size, 0, 'no object is ever completed from a part that failed verification');
  });

  it('source that changes during the copy is SOURCE_CHANGED, not copied', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    s.src.hook = { afterBytes: 6 * MiB, fn: () => { s.src.revision++; } };
    const c = await e.copy(j.id);
    assert.equal(c.sourceChanged, 1); assert.equal(c.copied, 0);
    assert.equal((await item(s, j.id)).status, 'SOURCE_CHANGED');
  });

  it('completion succeeded but the response was lost: the next attempt adopts the completed object and re-verifies it', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    s.dest.failNext('complete', 'after-write');
    const c = await e.copy(j.id);
    assert.equal(c.copied, 1, 'head() proves the object exists; read-back SHA-256 still decides');
    assert.equal((await e.verify(j.id)).verified, 1);
  });

  it('completion that really failed leaves the upload resumable and nothing READY', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    s.dest.failNext('complete', 'throw');
    const c = await e.copy(j.id);
    assert.equal(c.failed, 1);
    assert.equal([...s.repo.objects.values()][0].state, 'UPLOADING');
    s.clock.t += 60 * 60_000;
    const c2 = await s.engine('w2').copy(j.id);
    assert.equal(c2.copied, 1);
  });

  it('duplicate workers converge on one destination object', async () => {
    const s = setup(); const { j } = await s.prepared();
    const [a, b] = await Promise.all([s.engine('wa').copy(j.id), s.engine('wb').copy(j.id)]);
    assert.equal(a.copied + b.copied, 1);
    assert.equal(s.repo.objects.size, 1);
    assert.equal(s.dest.objects.size, 1);
  });

  it('idempotent replay uploads nothing and creates nothing', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    await e.copy(j.id); await e.verify(j.id);
    const parts = s.dest.calls.filter((x) => x === 'uploadPart').length;
    const again = await e.copy(j.id);
    assert.equal(again.claimed, 0);
    assert.equal(s.dest.calls.filter((x) => x === 'uploadPart').length, parts);
    assert.equal(s.repo.objects.size, 1);
  });

  it('the source is never modified or deleted by a multipart copy', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    const before = s.src.sha256('big');
    await e.copy(j.id); await e.verify(j.id, { rehashSource: true });
    assert.equal(s.src.sha256('big'), before);
    assert.equal((await e.reconcile(j.id)).retainedForRollback, 1);
  });

  it('a source stream shorter than its measured size is rejected: nothing is completed, nothing becomes READY', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    const realOpen = s.src.open.bind(s.src);
    s.src.open = async (id: string) => {
      const o = await realOpen(id); if (!o) return o;
      return { ...o, body: async () => (async function* () { let n = 0; for await (const c of await o.body()) { n += c.length; if (n > 11 * MiB) return; yield c; } })() };
    };
    const c = await e.copy(j.id);
    assert.equal(c.copied, 0);
    assert.equal(s.dest.objects.size, 0);
    assert.ok(!s.dest.calls.includes('complete'), 'a short stream must never reach completeMultipart');
    assert.ok([...s.repo.objects.values()].every((o) => o.state !== 'READY'));
  });

  it('a part corrupted in transit (provider ETag describes the corrupted bytes) is rejected before the object is ever completed', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    const orig = s.dest.uploadPart.bind(s.dest);
    s.dest.uploadPart = async (b, k, u, num, body) => { if (num === 2) { const bad = Buffer.from(body); bad[7] ^= 0xff; return orig(b, k, u, num, bad); } return orig(b, k, u, num, body); };
    const c = await e.copy(j.id);
    assert.equal(c.copied, 0);
    assert.ok(!s.dest.calls.includes('complete'), 'completion must not run after a part failed verification');
    assert.equal(s.dest.objects.size, 0);
  });

  it('objects above maxObjectBytes remain BLOCKED with an explicit reason', async () => {
    const s = setup(); const j = await s.ledger.createJob({ name: 'x', sourceProvider: 'legacy_r2', destinationBucket: DEST, mode: 'copy', createdBy: 't' });
    const e = new MigrationEngine({ ledger: s.ledger, source: s.src, drive: s.drive, destRepo: s.repo, worker: 'w', approval: TEST_APPROVAL, maxObjectBytes: 10 * MiB });
    await e.discover(j.id);
    assert.deepEqual((await e.dryRun(j.id)).blocked, { EXCEEDS_MAX_OBJECT_BYTES: 1 });
  });

  it('abandoned multipart uploads are aborted by reconciliation after the reservation expires', async () => {
    const s = setup(); const { j, e } = await s.prepared();
    s.dest.failNext('complete', 'throw');
    await e.copy(j.id);
    assert.equal(s.dest.uploads.size, 1);
    s.clock.t += 25 * 3600_000; // past the 24h multipart reservation
    await s.drive.reconcile();
    assert.equal(s.dest.uploads.size, 0, 'provider-side parts released');
    assert.notEqual([...s.repo.objects.values()][0].state, 'READY');
  });
});
