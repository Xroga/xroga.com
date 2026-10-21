import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { MemoryObjectStore } from '../memoryObjectStore.js';
import { defaultPolicyConfig } from '../policy.js';
import { MemoryStorageRepository } from '../repository.js';
import { StorageService } from '../storageService.js';
import { MUTATING, parseArgs, redactDeep, runPhase, toFlags, writeReceipt } from './cli.js';
import { MigrationEngine } from './engine.js';
import { MemoryLedger } from './ledger.js';
import { LegacyR2Source } from './sources.js';
import { approve, TEST_APPROVAL } from '../testing/approvals.js';

async function world() {
  const legacy = new MemoryObjectStore(); const dest = new MemoryObjectStore();
  const repo = new MemoryStorageRepository(); const ledger = new MemoryLedger();
  const drive = new StorageService({ repo, store: dest, bucket: 'drive', policy: defaultPolicyConfig({}) });
  const owner = randomUUID();
  legacy.seed('a', `users/${owner}/1700000000000-x.txt`, Buffer.from('x'));
  const e = new MigrationEngine({ ledger, source: new LegacyR2Source(legacy, 'a', ''), drive, destRepo: repo, worker: 'cli', approval: TEST_APPROVAL });
  const job = await ledger.createJob({ name: 'cli', sourceProvider: 'legacy_r2', destinationBucket: 'drive', mode: 'copy', createdBy: 't' });
  await runPhase(e, ledger, job.id, 'discover', { execute: false }); await runPhase(e, ledger, job.id, 'dry-run', { execute: false });
  await approve(ledger, job.id, 'copy');
  return { e, ledger, job, dest, legacy, repo };
}

describe('operator scripts: safe by default', () => {
  it('every mutating phase is a no-op report without --execute, even for an approved job', async () => {
    const w = await world();
    for (const p of MUTATING) {
      const r = await runPhase(w.e, w.ledger, w.job.id, p, { execute: false });
      assert.equal(r.executed, false); assert.equal(r.dryRunOnly, true);
    }
    assert.equal(w.dest.objects.size, 0); assert.equal(w.repo.objects.size, 0);
    const copyPlan = (await runPhase(w.e, w.ledger, w.job.id, 'copy', { execute: false })).result as { plan: { wouldCopy: number } };
    assert.equal(copyPlan.plan.wouldCopy, 1);
  });
  it('--execute performs the phase, and the receipt records that it did', async () => {
    const w = await world();
    const r = await runPhase(w.e, w.ledger, w.job.id, 'copy', { execute: true });
    assert.equal(r.executed, true); assert.equal(w.dest.objects.size, 1);
    const dir = await mkdtemp(path.join(tmpdir(), 'receipts-'));
    const file = await writeReceipt(dir, r);
    assert.equal((await readdir(dir)).length, 1);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).phase, 'copy');
    await assert.rejects(writeReceipt(dir, r), /EEXIST/, 'receipts are never overwritten');
  });
  it('read-only phases run without --execute', async () => {
    const w = await world();
    await runPhase(w.e, w.ledger, w.job.id, 'copy', { execute: true });
    for (const p of ['verify', 'reconcile', 'manifest'] as const) assert.equal((await runPhase(w.e, w.ledger, w.job.id, p, { execute: false })).dryRunOnly, false);
  });
  it('redacts signatures, keys and secret-named fields from logs and receipts', () => {
    const dirty = { url: 'https://x/o?X-Amz-Signature=abcdef123456&X-Amz-Credential=AKIAFOO', secretAccessKey: 'shh-very-secret', note: 'access_key: AKIAIOSFODNN7EXAMPLE and token=ghp_abcdefghijk' };
    const clean = JSON.stringify(redactDeep(dirty));
    for (const leak of ['abcdef123456', 'AKIAFOO', 'shh-very-secret', 'AKIAIOSFODNN7EXAMPLE', 'ghp_abcdefghijk']) assert.ok(!clean.includes(leak), leak);
  });
  it('parses flags without mistaking values for commands', () => {
    const { positional, flags } = parseArgs(['approve', '--job', 'J', '--execute', '--limit=5', '--receipt-dir', '/tmp/r']);
    assert.deepEqual(positional, ['approve']);
    assert.deepEqual(toFlags(flags), { execute: true, concurrency: undefined, limit: 5, pageSize: undefined, rehashSource: false });
  });
});
