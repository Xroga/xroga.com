import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sha256Hex } from './integrity.js';
import { persistArtifactToDrive, DRIVE_URI } from './artifactSink.js';
import { StorageService } from './storageService.js';
import { defaultPolicyConfig } from './policy.js';
import { BUCKET, harness } from './testing/harness.js';

describe('artifact sink', () => {
  it('returns a drive:// descriptor only after verified storage, and the bytes survive the producing process', async () => {
    const h = harness();
    const bytes = Buffer.from('%PDF-1.7 generated report');
    const d = await persistArtifactToDrive(h.svc, h.alice, { id: 'art-1', name: 'report.pdf', mediaType: 'application/pdf', bytes }, { projectId: h.aliceProject });
    assert.match(d.uri!, DRIVE_URI);
    assert.equal(d.sizeBytes, bytes.length);
    assert.equal(d.validation[0].detail, sha256Hex(bytes));
    // "process exit": a brand-new service over the same durable stores
    const reborn = new StorageService({ repo: h.repo, store: h.store, bucket: BUCKET, policy: defaultPolicyConfig({}) });
    const got = await reborn.readObjectBytes(h.alice, d.uri!.slice('drive://'.length));
    assert.deepEqual(got.bytes, bytes);
    await assert.rejects(reborn.readObjectBytes(h.bob, d.uri!.slice('drive://'.length)));
  });
  it('never returns a descriptor when storage failed', async () => {
    const h = harness();
    h.store.failNext('put', 'throw');
    await assert.rejects(persistArtifactToDrive(h.svc, h.alice, { id: 'a', name: 'x.txt', mediaType: 'text/plain', bytes: Buffer.from('x') }));
  });
});
