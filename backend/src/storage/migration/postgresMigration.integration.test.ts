import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type pg from 'pg';
import { sha256Hex } from '../integrity.js';
import { MemoryObjectStore } from '../memoryObjectStore.js';
import { defaultPolicyConfig } from '../policy.js';
import { PostgresStorageRepository } from '../postgresRepository.js';
import { StorageService } from '../storageService.js';
import { createDisposableDb, PG_TEST_URL } from '../testing/pgFixture.js';
import { MigrationEngine, type ReadLinker } from './engine.js';
import { PostgresLedger } from './postgresLedger.js';
import { ProjectFilesInlineSource, SupabaseStorageSource } from './sources.js';

const skip = PG_TEST_URL ? false : 'STORAGE_TEST_DATABASE_URL not set: real-Postgres migration tests not run';

describe('migration engine against real PostgreSQL ledger + metadata', { skip }, () => {
  let pool: pg.Pool; let drop: () => Promise<void>;
  before(async () => { const db = await createDisposableDb(); pool = db.pool; drop = db.drop; });
  after(async () => { await drop(); });

  it('project_files inline content (data URL + text) migrates, links on READ_NEW, unlinks on rollback; sources untouched', async () => {
    const owner = randomUUID(); const project = randomUUID();
    await pool.query('insert into public.projects (id, user_id) values ($1,$2)', [project, owner]);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(30, 9)]);
    const rows = [
      { name: 'a.ts', type: 'code', url: null as string | null, content: 'export const a = 1;' },
      { name: 'shot.png', type: 'image', url: `data:image/png;base64,${png.toString('base64')}`, content: null as string | null },
      { name: 'empty.bin', type: 'other', url: null, content: null }, // unrecoverable: no inline bytes at all
    ];
    const ids: string[] = [];
    for (const r of rows) ids.push((await pool.query('insert into public.project_files (project_id,file_name,file_type,file_url,content) values ($1,$2,$3,$4,$5) returning id', [project, r.name, r.type, r.url, r.content])).rows[0].id);

    const repo = new PostgresStorageRepository(pool); const ledger = new PostgresLedger(pool);
    const store = new MemoryObjectStore();
    const drive = new StorageService({ repo, store, bucket: 'b', policy: defaultPolicyConfig({}) });
    const linker: ReadLinker = {
      link: async (it) => { await pool.query('update public.project_files set storage_object_id=$1 where id = replace($2,$3,$4)::uuid', [it.destinationObjectId, it.sourceId, 'project_files:', '']); },
      unlink: async (it) => { await pool.query('update public.project_files set storage_object_id=null where id = replace($1,$2,$3)::uuid', [it.sourceId, 'project_files:', '']); },
    };
    const source = new ProjectFilesInlineSource(pool);
    const e = new MigrationEngine({ ledger, source, drive, destRepo: repo, worker: 'w1', linker });
    const job = await ledger.createJob({ name: 'inline', sourceProvider: 'project_files_inline', destinationBucket: 'b', mode: 'copy', createdBy: 't' });
    await ledger.approve(job.id, 'copy', 'owner', 'T'); await ledger.approve(job.id, 'read_new', 'owner', 'T');

    // only rows whose bytes are recoverable are even discovered
    assert.equal((await e.discover(job.id)).inserted, 2);
    const plan = await e.dryRun(job.id);
    assert.equal(plan.eligible, 2);
    const before = (await pool.query('select id, content, file_url from public.project_files order by id')).rows;
    assert.equal((await e.copy(job.id)).copied, 2);
    assert.equal((await e.verify(job.id)).verified, 2);
    const rec = await e.reconcile(job.id);
    assert.deepEqual([rec.discovered, rec.sha256Verified, rec.metadataMismatches, rec.consistent], [2, 2, 0, true]);

    const dest = (await pool.query('select o.sha256_verified, o.state, o.tenant_id from public.storage_migration_items i join public.storage_objects o on o.id=i.destination_object_id order by i.source_id')).rows;
    assert.deepEqual(dest.map((d) => d.state), ['READY', 'READY']);
    assert.ok(dest.every((d) => d.tenant_id === owner));
    assert.ok(dest.map((d) => d.sha256_verified).includes(sha256Hex(png)));

    assert.equal((await e.readNew(job.id)).switched, 2);
    assert.equal((await pool.query('select count(*)::int n from public.project_files where storage_object_id is not null')).rows[0].n, 2);
    assert.equal((await e.rollbackReadMode(job.id)).reverted, 2);
    assert.equal((await pool.query('select count(*)::int n from public.project_files where storage_object_id is not null')).rows[0].n, 0);
    assert.deepEqual((await pool.query('select id, content, file_url from public.project_files order by id')).rows, before, 'source columns byte-identical after migrate + rollback');
    assert.ok(ids.length === 3);
  });

  it('two workers on real SKIP LOCKED claims copy every item once; replaying changes nothing', async () => {
    const legacyOwner = randomUUID();
    const project = randomUUID();
    await pool.query('insert into public.projects (id, user_id) values ($1,$2)', [project, legacyOwner]);
    for (let i = 0; i < 16; i++) await pool.query('insert into public.project_files (project_id,file_name,file_type,content) values ($1,$2,$3,$4)', [project, `c${i}.txt`, 'code', `concurrent ${i}`]);
    const repo = new PostgresStorageRepository(pool); const ledger = new PostgresLedger(pool); const store = new MemoryObjectStore();
    const drive = new StorageService({ repo, store, bucket: 'b', policy: defaultPolicyConfig({}) });
    const mk = (w: string) => new MigrationEngine({ ledger, source: new ProjectFilesInlineSource(pool), drive, destRepo: repo, worker: w });
    const job = await ledger.createJob({ name: 'conc', sourceProvider: 'project_files_inline', destinationBucket: 'b', mode: 'copy', createdBy: 't' });
    await ledger.approve(job.id, 'copy', 'owner', 'T');
    const mine = await mk('x').discover(job.id);
    assert.ok(mine.inserted >= 16);
    await mk('x').dryRun(job.id);
    const before = store.objects.size;
    const [a, b, c] = await Promise.all([mk('A').copy(job.id, { concurrency: 4 }), mk('B').copy(job.id, { concurrency: 4 }), mk('C').copy(job.id, { concurrency: 4 })]);
    assert.equal(a.copied + b.copied + c.copied, 16);
    assert.equal(store.objects.size - before, 16);
    assert.equal((await mk('x').copy(job.id)).claimed, 0);
    const dup = await pool.query(`select source_id, count(*) from public.storage_migration_items group by 1 having count(*) > 1`);
    assert.equal(dup.rowCount, 0);
    assert.equal((await mk('x').verify(job.id)).verified, 16);
  });

  it('SupabaseStorageSource: owner from a UUID folder, unknown owner BLOCKED, secret bucket refused', async () => {
    const owner = randomUUID();
    const files: Record<string, Buffer> = { [`${owner}`]: Buffer.alloc(0) };
    const client = {
      list: async (_b: string, folder: string, off: number, limit: number) => {
        const all = folder === '' ? [{ name: owner, size: 0, isFolder: true }, { name: 'avatars', size: 0, isFolder: true }] : [];
        return all.slice(off, off + limit);
      },
      download: async () => Buffer.from('x'),
    };
    assert.ok(files);
    const src = new SupabaseStorageSource({ ...client, list: async (b, f, o, l) => (f === '' ? [] : [{ name: 'me.png', size: 3, isFolder: false }]).slice(o, o + l) }, 'avatars');
    const page = await src.discover('avatars|0', 10);
    assert.equal(page.items[0].blockedReason, 'UNKNOWN_OWNER');
    const page2 = await src.discover(`${owner}|0`, 10);
    assert.equal(page2.items[0].ownerUserId, owner);
    assert.throws(() => new SupabaseStorageSource(client as never, 'xroga-github-tokens'));
  });
});
