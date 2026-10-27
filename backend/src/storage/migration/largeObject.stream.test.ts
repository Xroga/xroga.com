import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { defaultPolicyConfig } from '../policy.js';
import { MemoryStorageRepository } from '../repository.js';
import { StorageService } from '../storageService.js';
import { approve, TEST_APPROVAL } from '../testing/approvals.js';
import { FileObjectStore } from '../testing/fileObjectStore.js';
import { GeneratedSource } from '../testing/generatedSource.js';
import { MigrationEngine } from './engine.js';
import { MemoryLedger } from './ledger.js';

/**
 * Real >1 GiB crossing with the DEFAULT thresholds (no test-only lowering) and a disk-backed synthetic store.
 * Proves memory is bounded by the part window, not the object size. Gated: ~2 GiB of temp-disk I/O.
 * Run with XROGA_LARGE_TEST=1; an ungated run reports SKIP, which the strict runner never counts as PASS.
 */
const enabled = process.env.XROGA_LARGE_TEST === '1';
const MiB = 1024 * 1024;
// XROGA_LARGE_TEST_MIB lowers the size for diagnosis only; evidence runs use the default (1 GiB + 5 bytes, the previous ceiling)
const MIB = Number(process.env.XROGA_LARGE_TEST_MIB) || 1024;
const SIZE = MIB * MiB + 5;
const lap = (() => { const t0 = Date.now(); return (m: string) => console.error(`[large] +${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`); })();

describe('large-object migration: real 1 GiB+ crossing', { skip: enabled ? false : 'set XROGA_LARGE_TEST=1 (needs ~1.2 GiB free temp disk)' }, () => {
  it('copies a 1 GiB + 5 byte object with bounded memory and verifies the end-to-end SHA-256', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xroga-large-'));
    const dest = new FileObjectStore(root);
    try {
      const now = () => new Date();
      const src = new GeneratedSource({ huge: SIZE });
      const repo = new MemoryStorageRepository(now);
      const ledger = new MemoryLedger(now);
      const drive = new StorageService({ repo, store: dest, bucket: 'xroga-drive-test', policy: { ...defaultPolicyConfig({}) }, now });
      const engine = new MigrationEngine({ ledger, source: src, drive, destRepo: repo, worker: 'w', now, approval: TEST_APPROVAL, multipart: { concurrency: 2 }, ...(MIB >= 1024 ? {} : { maxStreamCopyBytes: 16 * MiB }) });
      const j = await ledger.createJob({ name: 'huge', sourceProvider: 'legacy_r2', destinationBucket: 'xroga-drive-test', mode: 'copy', createdBy: 't' });
      await engine.discover(j.id); await engine.dryRun(j.id); await approve(ledger, j.id, 'copy');

      global.gc?.();
      const base = process.memoryUsage().rss; let peak = base;
      const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 25);
      const t0 = Date.now();
      let summary;
      try { summary = await engine.copy(j.id); } finally { clearInterval(timer); }
      lap('copy done');
      const secs = (Date.now() - t0) / 1000;

      const expected = src.sha256('huge'); lap('expected hash computed');
      assert.deepEqual([summary.copied, summary.failed, summary.blocked], [1, 0, 0]);
      const it = (await ledger.listItems(j.id, null, 5))[0];
      assert.equal(it.sourceSize, SIZE);
      assert.equal(it.destinationSha256, expected, 'end-to-end SHA-256 equals the independently streamed source hash');
      const growthMiB = (peak - base) / MiB;
      console.log(`LARGE_OBJECT_EVIDENCE size=${SIZE} parts=${dest.partCalls} seconds=${secs.toFixed(1)} rss_growth_mib=${growthMiB.toFixed(0)}`);
      // window = (concurrency 2 + 1 accumulating) x 16 MiB parts + stream buffers; allow generous slack, still << 1 GiB
      assert.ok(growthMiB < 400, `memory grew ${growthMiB.toFixed(0)} MiB for a ${SIZE / MiB} MiB object`);
      assert.ok(dest.partCalls >= Math.floor(SIZE / (16 * MiB)), 'object was actually sent as many parts');
    } finally {
      await dest.cleanup();
    }
  });
});
