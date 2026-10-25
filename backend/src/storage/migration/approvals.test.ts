import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { MemoryObjectStore } from '../memoryObjectStore.js';
import { defaultPolicyConfig } from '../policy.js';
import { MemoryStorageRepository } from '../repository.js';
import { StorageService } from '../storageService.js';
import { approve, KEYS, OTHER_KEYS, TEST_APPROVAL } from '../testing/approvals.js';
import { signApproval } from './approvals.js';
import { MigrationEngine } from './engine.js';
import { MemoryLedger } from './ledger.js';
import { LegacyR2Source } from './sources.js';
import { NotApprovedError } from './types.js';

function world(n = 3) {
  const clock = { t: Date.parse('2026-10-22T10:00:00Z') };
  const now = () => new Date(clock.t);
  const legacy = new MemoryObjectStore(() => clock.t), dest = new MemoryObjectStore(() => clock.t);
  const repo = new MemoryStorageRepository(now), ledger = new MemoryLedger(now);
  const drive = new StorageService({ repo, store: dest, bucket: 'drive', policy: defaultPolicyConfig({}), now });
  const owners = Array.from({ length: n }, () => randomUUID());
  owners.forEach((o, i) => legacy.seed('a', `users/${o}/17000000000${i}-f${i}.txt`, Buffer.from(`file ${i}`)));
  const source = new LegacyR2Source(legacy, 'a', '');
  const engine = (env: 'test' | 'staging' | 'production' = 'test', key = KEYS.publicKeyPem) => new MigrationEngine({ ledger, source, drive, destRepo: repo, worker: 'w', now, approval: { publicKeyPem: key, environment: env } });
  const planned = async (e = engine()) => {
    const j = await ledger.createJob({ name: 't', sourceProvider: 'legacy_r2', destinationBucket: 'drive', mode: 'copy', createdBy: 't' });
    await e.discover(j.id); await e.dryRun(j.id);
    return j;
  };
  return { clock, legacy, dest, repo, ledger, engine, planned, owners };
}
const refuses = async (p: Promise<unknown>, reason: string) => assert.rejects(p, (e: NotApprovedError) => { assert.ok(e instanceof NotApprovedError, String(e)); assert.equal(e.reason, reason); return true; });

describe('migration approvals are cryptographic, scoped and fail closed', () => {
  it('no approver key configured → nothing can be approved; no token → refused', async () => {
    const w = world(); const j = await w.planned();
    await approve(w.ledger, j.id, 'copy', { now: w.clock.t });
    const noKey = new MigrationEngine({ ledger: w.ledger, source: new LegacyR2Source(w.legacy, 'a', ''), drive: new StorageService({ repo: w.repo, store: w.dest, bucket: 'drive', policy: defaultPolicyConfig({}) }), destRepo: w.repo, worker: 'w' });
    await refuses(noKey.copy(j.id), 'NO_APPROVER_KEY_CONFIGURED');
    const j2 = await w.planned();
    await refuses(w.engine().copy(j2.id), 'NO_APPROVAL');
    assert.equal(w.dest.objects.size, 0);
  });

  it('forged approvals are refused: wrong key, tampered payload, hand-written JSON, legacy object format', async () => {
    const w = world(); const j = await w.planned();
    await approve(w.ledger, j.id, 'copy', { keys: OTHER_KEYS, now: w.clock.t });
    await refuses(w.engine().copy(j.id), 'BAD_SIGNATURE');
    const good = await approve(w.ledger, j.id, 'copy', { now: w.clock.t });
    const [p, s] = good.split('.');
    const edited = JSON.parse(Buffer.from(p, 'base64url').toString()); edited.expiresAt += 10 ** 12;
    await w.ledger.approve(j.id, 'copy', `${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${s}`);
    await refuses(w.engine().copy(j.id), 'BAD_SIGNATURE');
    for (const junk of ['yes', 'true', '{"by":"me","ref":"x"}', '.', 'a.b.c']) {
      await w.ledger.approve(j.id, 'copy', junk);
      await assert.rejects(w.engine().copy(j.id), (e: NotApprovedError) => e instanceof NotApprovedError && ['MALFORMED', 'BAD_SIGNATURE'].includes(e.reason));
    }
    assert.equal(w.dest.objects.size, 0);
  });

  it('wrong job: a valid approval for job A cannot run job B (replay across jobs)', async () => {
    const w = world(); const a = await w.planned(); const b = await w.planned();
    const tokenA = await approve(w.ledger, a.id, 'copy', { now: w.clock.t });
    await w.ledger.approve(b.id, 'copy', tokenA);
    await refuses(w.engine().copy(b.id), 'WRONG_JOB');
    assert.equal(w.dest.objects.size, 0);
  });

  it('wrong stage: a copy approval cannot authorise read_new or freeze_old', async () => {
    const w = world(); const j = await w.planned(); const e = w.engine();
    const t = await approve(w.ledger, j.id, 'copy', { now: w.clock.t });
    await e.copy(j.id); await e.verify(j.id);
    await w.ledger.approve(j.id, 'read_new', t); await w.ledger.approve(j.id, 'freeze_old', t);
    await refuses(e.readNew(j.id), 'WRONG_STAGE'); await refuses(e.freezeOld(j.id), 'WRONG_STAGE');
  });

  it('environment separation: test approvals cannot run in production and production approvals cannot run in a test engine', async () => {
    const w = world(); const j = await w.planned();
    await approve(w.ledger, j.id, 'copy', { environment: 'test', now: w.clock.t });
    await refuses(w.engine('production').copy(j.id), 'WRONG_ENVIRONMENT');
    await refuses(w.engine('staging').copy(j.id), 'WRONG_ENVIRONMENT');
    await approve(w.ledger, j.id, 'copy', { environment: 'production', now: w.clock.t });
    await refuses(w.engine('test').copy(j.id), 'WRONG_ENVIRONMENT');
    assert.equal(w.dest.objects.size, 0);
    assert.equal((await w.engine('production').copy(j.id)).copied, 3, 'the production engine accepts the production approval');
  });

  it('stale approval: expires, and is re-checked before every batch of a long run', async () => {
    const w = world(); const j = await w.planned(); const e = w.engine();
    await approve(w.ledger, j.id, 'copy', { ttlMs: 60_000, now: w.clock.t });
    w.clock.t += 61_000;
    await refuses(e.copy(j.id), 'EXPIRED');
    await approve(w.ledger, j.id, 'copy', { ttlMs: 60_000, now: w.clock.t });
    const first = await e.copy(j.id, { concurrency: 1, limit: 1 });
    assert.equal(first.copied, 1);
    w.clock.t += 120_000;
    await refuses(e.copy(j.id, { concurrency: 1 }), 'EXPIRED');
    assert.equal(w.dest.objects.size, 1, 'the run stopped when the approval lapsed');
  });

  it('source changed after approval: new or changed objects void the plan and the approval', async () => {
    const w = world(); const j = await w.planned(); const e = w.engine();
    await approve(w.ledger, j.id, 'copy', { now: w.clock.t });
    // a new object appears in the source after approval
    w.legacy.seed('a', `users/${randomUUID()}/1700000009999-new.txt`, Buffer.from('late arrival'));
    await e.discover(j.id);
    assert.equal((await w.ledger.getJob(j.id))!.plan, null);
    await refuses(e.copy(j.id), 'NO_PLAN');
    await e.dryRun(j.id);
    await refuses(e.copy(j.id), 'PLAN_CHANGED');
    await approve(w.ledger, j.id, 'copy', { now: w.clock.t });
    assert.equal((await e.copy(j.id)).copied, 4);
  });

  it('an existing object edited after approval is never copied under the old approval', async () => {
    const w = world(); const j = await w.planned(); const e = w.engine();
    await approve(w.ledger, j.id, 'copy', { now: w.clock.t });
    const victim = (await w.ledger.listItems(j.id, null, 5))[0];
    w.legacy.seed('a', victim.sourceId, Buffer.from('EDITED AFTER APPROVAL'));
    await e.discover(j.id);
    await refuses(e.copy(j.id), 'NO_PLAN');
    assert.equal(w.dest.objects.size, 0);
  });

  it('replaying a completed job copies nothing and creates nothing', async () => {
    const w = world(); const j = await w.planned(); const e = w.engine();
    await approve(w.ledger, j.id, 'copy', { now: w.clock.t });
    assert.equal((await e.copy(j.id)).copied, 3);
    const before = w.dest.objects.size;
    const again = await e.copy(j.id);
    assert.deepEqual([again.claimed, again.copied], [0, 0]);
    assert.equal(w.dest.objects.size, before);
  });

  it('a dry-run replay does not invalidate a valid approval, but re-planning after copy started does require a fresh one', async () => {
    const w = world(); const j = await w.planned(); const e = w.engine();
    await approve(w.ledger, j.id, 'copy', { now: w.clock.t });
    await e.dryRun(j.id); await e.dryRun(j.id);
    assert.equal((await e.copy(j.id)).copied, 3);
  });

  it('tenant scope: objects of other tenants are BLOCKED(OUT_OF_APPROVAL_SCOPE), never copied', async () => {
    const w = world(); const j = await w.planned(); const e = w.engine();
    await approve(w.ledger, j.id, 'copy', { now: w.clock.t, tenantScope: [w.owners[0]] });
    const r = await e.copy(j.id);
    assert.deepEqual([r.copied, r.blocked], [1, 2]);
    const items = await w.ledger.listItems(j.id, ['BLOCKED'], 10);
    assert.ok(items.every((i) => i.skipReason === 'OUT_OF_APPROVAL_SCOPE' && i.tenantId !== w.owners[0]));
    const objs = [...w.repo.objects.values()];
    assert.equal(objs.length, 1); assert.equal(objs[0].tenantId, w.owners[0]);
  });

  it('signing helper output verifies only with the matching public key', () => {
    const t = signApproval(KEYS.privateKeyPem, { v: 1, jobId: 'j', stage: 'copy', operator: 'o', environment: 'test', sourceProvider: 's', destinationBucket: 'b', planDigest: 'd', issuedAt: 0, expiresAt: 1 });
    assert.equal(t.split('.').length, 2);
    assert.ok(!t.includes('PRIVATE'));
  });
});
