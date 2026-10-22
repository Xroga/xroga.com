import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type pg from 'pg';
import { sha256Hex } from '../integrity.js';
import { MemoryObjectStore } from '../memoryObjectStore.js';
import { defaultPolicyConfig } from '../policy.js';
import { PostgresStorageRepository } from '../postgresRepository.js';
import { StorageService } from '../storageService.js';
import { approve, TEST_APPROVAL } from '../testing/approvals.js';
import { createDisposableDb, PG_TEST_URL } from '../testing/pgFixture.js';
import { MigrationEngine } from './engine.js';
import { PostgresLedger } from './postgresLedger.js';
import { readStoredFileOrdered } from './readCompat.js';
import { looksLikeCredential, RunOutputArtifactsSource } from './sources.js';

const skip = PG_TEST_URL ? false : 'STORAGE_TEST_DATABASE_URL not set: real-Postgres run-output tests not run';
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 5)]);
const desc = (id: string, name: string, mediaType: string, extra: Record<string, unknown> = {}) => ({ id, name, mediaType, validation: [], ...extra });

describe('run-output artifact adapter (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool; let drop: () => Promise<void>;
  before(async () => { const db = await createDisposableDb(); pool = db.pool; drop = db.drop; });
  after(async () => { await drop(); });

  const alice = randomUUID(), bob = randomUUID();
  const aliceProject = randomUUID(), bobProject = randomUUID();
  const run = { a: randomUUID(), b: randomUUID(), eng: randomUUID(), live: randomUUID(), cross: randomUUID() };
  const insertRun = (id: string, user: string, project: string | null, status: string, output: unknown) =>
    pool.query('insert into public.swarm_runs (id,user_id,project_id,status,output) values ($1,$2,$3,$4,$5::jsonb)', [id, user, project, status, JSON.stringify(output)]);

  it('only genuine inline artifacts are eligible; metadata, credentials, duplicates and non-terminal runs are classified, never copied', async () => {
    await pool.query('insert into public.projects (id,user_id) values ($1,$2),($3,$4)', [aliceProject, alice, bobProject, bob]);
    const note = 'quarterly notes';
    await insertRun(run.a, alice, aliceProject, 'completed', {
      type: 'xroga.output', version: '1.0', status: 'completed', summary: 'done', evidence: [], blockers: [], nextActions: [],
      accessToken: 'ghp_NOT_A_FILE_but_a_field_in_the_output_json_0000000000', // a credential-bearing FIELD is not an artifact and is never read
      artifacts: [
        desc('a-note', 'notes.txt', 'text/plain', { inline: note, sizeBytes: Buffer.byteLength(note) }),
        desc('a-png', 'shot.png', 'image/png', { inline: `data:image/png;base64,${png.toString('base64')}`, sizeBytes: png.length }),
        desc('a-meta', 'src/App.tsx', 'text/plain', { sizeBytes: 900 }), // what the production writer emits today: metadata only
        desc('a-local', 'build.zip', 'application/zip', { uri: '/tmp/xroga/run/build.zip' }),
        desc('a-drive', 'done.txt', 'text/plain', { uri: `drive://${randomUUID()}` }),
        desc('a-env', '.env', 'text/plain', { inline: 'PORT=3000' }),
        desc('a-key', 'out.txt', 'text/plain', { inline: 'token = ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD' }),
        desc('a-size', 'liar.txt', 'text/plain', { inline: 'abc', sizeBytes: 999 }),
        desc('a-dup', 'one.txt', 'text/plain', { inline: 'first' }),
        desc('a-dup', 'two.txt', 'text/plain', { inline: 'second' }),
      ],
    });
    await insertRun(run.b, bob, bobProject, 'completed', { type: 'xroga.output', version: '1.0', artifacts: [desc('b-1', 'bob.txt', 'text/plain', { inline: 'bob data' })], evidence: [], blockers: [] });
    await insertRun(run.eng, alice, aliceProject, 'completed', { type: 'engineering_artifact', artifactVersion: 1, summary: 'manifest only', files: [{ path: 'a.ts' }] });
    await insertRun(run.live, alice, aliceProject, 'building', { type: 'xroga.output', version: '1.0', artifacts: [desc('live-1', 'live.txt', 'text/plain', { inline: 'still running' })], evidence: [], blockers: [] });
    await insertRun(run.cross, alice, bobProject, 'completed', { type: 'xroga.output', version: '1.0', artifacts: [desc('x-1', 'x.txt', 'text/plain', { inline: 'wrong project' })], evidence: [], blockers: [] });

    const repo = new PostgresStorageRepository(pool); const ledger = new PostgresLedger(pool);
    const drive = new StorageService({ repo, store: new MemoryObjectStore(), bucket: 'b', policy: defaultPolicyConfig({}) });
    const source = new RunOutputArtifactsSource(pool);
    const e = new MigrationEngine({ ledger, source, drive, destRepo: repo, worker: 'w1', approval: TEST_APPROVAL });
    const job = await ledger.createJob({ name: 'runs', sourceProvider: 'run_output_artifacts', destinationBucket: 'b', mode: 'copy', createdBy: 't' });
    const before = (await pool.query("select id, output::text o from public.swarm_runs order by id")).rows;

    const d = await e.discover(job.id);
    // alice: 9 distinct ids (the duplicate id collapses to one blocked row) + bob: 1 + cross-project run: 1 = 11; engineering manifest and the 'building' run contribute nothing
    assert.equal(d.inserted, 11);
    const plan = await e.dryRun(job.id);
    assert.deepEqual(plan.blocked, {
      ALREADY_CANONICAL: 1, CREDENTIAL_LIKE_CONTENT: 2, DECLARED_SIZE_MISMATCH: 1, DUPLICATE_ARTIFACT_ID: 1, NO_RECOVERABLE_BYTES: 2,
    });
    assert.equal(plan.eligible, 4); // a-note, a-png, bob, cross-project (the last is refused later, at ingest)
    await approve(ledger, job.id, 'copy');
    const c = await e.copy(job.id);
    assert.equal(c.copied, 3);
    assert.equal(c.blocked, 1, 'a run that points at someone else\'s project is refused by Drive, not copied');
    const items = await ledger.listItems(job.id, null, 50);
    const cross = items.find((i) => i.sourceId.includes('#x-1'))!;
    assert.equal(cross.status, 'BLOCKED'); assert.equal(cross.skipReason, 'DESTINATION_NOT_FOUND'); // Drive answers NOT_FOUND for a project the owner does not own: permanent, so BLOCKED, not retried

    assert.equal((await e.verify(job.id)).verified, 3);
    const rec = await e.reconcile(job.id);
    assert.equal(rec.consistent, true); assert.equal(rec.metadataMismatches, 0); assert.equal(rec.sha256Verified, 3);

    // ownership comes from swarm_runs.user_id, content hashes match, nothing credential-like was admitted
    const note1 = items.find((i) => i.sourceId.endsWith('#a-note'))!;
    const o1 = (await repo.getObject(note1.destinationObjectId!))!;
    assert.equal(o1.ownerUserId, alice); assert.equal(o1.projectId, aliceProject); assert.equal(o1.sha256Verified, sha256Hex(Buffer.from(note)));
    const bob1 = (await repo.getObject(items.find((i) => i.sourceId.endsWith('#b-1'))!.destinationObjectId!))!;
    assert.equal(bob1.ownerUserId, bob); assert.equal(bob1.tenantId, bob);
    assert.equal(o1.legacySource && (o1.legacySource as { provider?: string }).provider, 'run_output_artifacts');
    const png1 = (await repo.getObject(items.find((i) => i.sourceId.endsWith('#a-png'))!.destinationObjectId!))!;
    assert.equal(png1.sha256Verified, sha256Hex(png)); assert.equal(png1.contentType, 'image/png');
    for (const i of items.filter((x) => x.status === 'BLOCKED' && x.destinationObjectId)) assert.fail(`blocked item ${i.sourceId} has a destination`);
    assert.equal((await repo.getObject(items.find((i) => i.sourceId.endsWith('#a-env'))!.destinationObjectId ?? randomUUID())), null);

    // the source rows are byte-identical afterwards (rollback = do nothing)
    assert.deepEqual((await pool.query("select id, output::text o from public.swarm_runs order by id")).rows, before);

    // restart + replay: nothing new, nothing duplicated
    const e2 = new MigrationEngine({ ledger, source, drive, destRepo: repo, worker: 'w2-restarted', approval: TEST_APPROVAL });
    assert.equal((await e2.discover(job.id)).inserted, 0);
    assert.equal((await e2.copy(job.id)).claimed, 0);

    // backward-compatible READ: the old run-artifact reference resolves to the canonical copy only after READ_NEW, only for its owner
    const ref = note1.sourceId;
    const readDeps = { ledger, drive, readLegacy: async () => { throw new Error('NoSuchKey'); }, order: ['r2' as const], provider: 'run_output_artifacts' as const };
    await assert.rejects(readStoredFileOrdered(ref, { userId: alice, tenantId: alice }, readDeps), /not migrated|not found/i);
    await approve(ledger, job.id, 'read_new');
    await e2.readNew(job.id);
    const got = await readStoredFileOrdered(ref, { userId: alice, tenantId: alice }, readDeps);
    assert.equal(got.buffer.toString(), note);
    await assert.rejects(readStoredFileOrdered(ref, { userId: bob, tenantId: bob }, readDeps), /not your file|forbidden/i);
    assert.equal((await e2.rollbackReadMode(job.id)).reverted, 3);
    await assert.rejects(readStoredFileOrdered(ref, { userId: alice, tenantId: alice }, readDeps), /not migrated|not found/i);
  });

  it('open() refuses credentials and ambiguous ids, and returns null for runs that vanished', async () => {
    const source = new RunOutputArtifactsSource(pool);
    assert.equal(await source.open(`swarm_runs:${run.a}#a-env`), null);
    assert.equal(await source.open(`swarm_runs:${run.a}#a-key`), null);
    assert.equal(await source.open(`swarm_runs:${run.a}#a-dup`), null);
    assert.equal(await source.open(`swarm_runs:${randomUUID()}#x`), null);
    assert.equal(await source.open('not-a-run-reference'), null);
  });

  it('credential heuristics catch keys and tokens by name and by content', () => {
    assert.ok(looksLikeCredential('deploy/.env', null));
    assert.ok(looksLikeCredential('id_rsa', null));
    assert.ok(looksLikeCredential('x.pem', null));
    assert.ok(looksLikeCredential('a.txt', Buffer.from('-----BEGIN RSA PRIVATE KEY-----\nabc')));
    assert.ok(looksLikeCredential('a.txt', Buffer.from('AKIAABCDEFGHIJKLMNOP')));
    assert.ok(!looksLikeCredential('README.md', Buffer.from('hello world')));
  });
});
