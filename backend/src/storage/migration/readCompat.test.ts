import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { MemoryObjectStore } from '../memoryObjectStore.js';
import { defaultPolicyConfig } from '../policy.js';
import { MemoryStorageRepository } from '../repository.js';
import { StorageService } from '../storageService.js';
import { MigrationEngine } from './engine.js';
import { MemoryLedger } from './ledger.js';
import { readStoredFileOrdered, type ReadSource } from './readCompat.js';
import { LegacyR2Source } from './sources.js';
import { approve, TEST_APPROVAL } from '../testing/approvals.js';

async function world() {
  const legacy = new MemoryObjectStore(); const dest = new MemoryObjectStore();
  const repo = new MemoryStorageRepository(); const ledger = new MemoryLedger();
  const drive = new StorageService({ repo, store: dest, bucket: 'drive', policy: defaultPolicyConfig({}) });
  const alice = randomUUID(), bob = randomUUID();
  const aliceKey = `users/${alice}/1700000000000-a.txt`;
  legacy.seed('assets', aliceKey, Buffer.from('legacy alice'));
  const e = new MigrationEngine({ ledger, source: new LegacyR2Source(legacy, 'assets', ''), drive, destRepo: repo, worker: 'w', approval: TEST_APPROVAL });
  const job = await ledger.createJob({ name: 'r', sourceProvider: 'legacy_r2', destinationBucket: 'drive', mode: 'copy', createdBy: 't' });
  await e.discover(job.id); await e.dryRun(job.id);
  await approve(ledger, job.id, 'copy'); await approve(ledger, job.id, 'read_new');
  await e.copy(job.id); await e.verify(job.id);
  const deps = (order: ReadSource[]) => ({
    ledger, drive, order,
    readLegacy: async (k: string) => { const o = legacy.objects.get(`assets\u0000${k}`); if (!o) throw new Error('NoSuchKey'); return { buffer: o.body, contentType: o.contentType }; },
  });
  return { legacy, dest, repo, ledger, drive, e, job, alice, bob, aliceKey, deps };
}
const A = (id: string) => ({ userId: id, tenantId: id });

describe('STORAGE_READ_ORDER compatibility', () => {
  it('legacy,r2 serves legacy; r2,legacy serves canonical only after READ_NEW; rollback flips it back', async () => {
    const w = await world();
    assert.equal((await readStoredFileOrdered(w.aliceKey, A(w.alice), w.deps(['legacy', 'r2']))).from, 'legacy');
    assert.equal((await readStoredFileOrdered(w.aliceKey, A(w.alice), w.deps(['r2', 'legacy']))).from, 'legacy', 'verified but not switched yet');
    await w.e.readNew(w.job.id);
    const r = await readStoredFileOrdered(w.aliceKey, A(w.alice), w.deps(['r2', 'legacy']));
    assert.equal(r.from, 'r2'); assert.equal(r.buffer.toString(), 'legacy alice');
    await w.e.rollbackReadMode(w.job.id);
    assert.equal((await readStoredFileOrdered(w.aliceKey, A(w.alice), w.deps(['r2', 'legacy']))).from, 'legacy');
  });
  it('ownership is enforced on BOTH paths: another user is refused, not served from the fallback', async () => {
    const w = await world(); await w.e.readNew(w.job.id);
    for (const order of [['r2', 'legacy'], ['legacy', 'r2']] as ReadSource[][]) {
      await assert.rejects(readStoredFileOrdered(w.aliceKey, A(w.bob), w.deps(order)), (e: { code: string }) => e.code === 'FORBIDDEN');
    }
  });
  it('a corrupt canonical copy is an error, not a silent fallback to the other copy', async () => {
    const w = await world(); await w.e.readNew(w.job.id);
    const item = (await w.ledger.listItems(w.job.id, null, 5))[0];
    w.dest.corrupt('drive', item.destinationKey!);
    await assert.rejects(readStoredFileOrdered(w.aliceKey, A(w.alice), w.deps(['r2', 'legacy'])), (e: { code: string }) => e.code === 'CORRUPT');
  });
  it('a missing legacy object falls through to the verified canonical copy (and vice versa)', async () => {
    const w = await world(); await w.e.readNew(w.job.id);
    w.legacy.remove('assets', w.aliceKey);
    assert.equal((await readStoredFileOrdered(w.aliceKey, A(w.alice), w.deps(['legacy', 'r2']))).from, 'r2');
    await assert.rejects(readStoredFileOrdered(`users/${w.alice}/never-existed.txt`, A(w.alice), w.deps(['legacy', 'r2'])), (e: { code?: string }) => e.code === 'NOT_FOUND');
  });
});
