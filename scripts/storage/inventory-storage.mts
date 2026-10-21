/**
 * Read-only inventory of where customer bytes live today. Lists and counts only; never downloads, writes or deletes.
 * Each source that cannot be reached is reported BLOCKED with the missing configuration, not omitted.
 */
import { LegacyR2Source, ProjectFilesInlineSource } from '../../backend/src/storage/migration/sources.js';
import { R2ObjectStore } from '../../backend/src/storage/r2ObjectStore.js';
import { createPool } from '../../backend/src/storage/runtime.js';

const out: Record<string, unknown> = { at: new Date().toISOString(), mode: 'read-only' };
const env = process.env;

const accountId = env.CLOUDFLARE_R2_ACCOUNT_ID ?? env.CLOUDFLARE_ACCOUNT_ID;
if (accountId && env.CLOUDFLARE_R2_ACCESS_KEY && env.CLOUDFLARE_R2_SECRET_KEY) {
  const bucket = env.CLOUDFLARE_R2_BUCKET ?? 'xroga-assets';
  const src = new LegacyR2Source(new R2ObjectStore({ accountId, accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY, secretAccessKey: env.CLOUDFLARE_R2_SECRET_KEY, bucket }), bucket, 'users/');
  let cursor: string | undefined; let n = 0, bytes = 0, unknownOwner = 0; const owners = new Set<string>();
  do {
    const page = await src.discover(cursor, 1000);
    for (const i of page.items) { n++; bytes += i.size ?? 0; if (i.ownerUserId) owners.add(i.ownerUserId); else unknownOwner++; }
    cursor = page.next;
  } while (cursor);
  out.legacy_r2 = { bucket, objects: n, bytes, owners: owners.size, unknownOwner };
} else out.legacy_r2 = { status: 'BLOCKED', missing: ['CLOUDFLARE_R2_ACCOUNT_ID', 'CLOUDFLARE_R2_ACCESS_KEY', 'CLOUDFLARE_R2_SECRET_KEY'].filter((k) => !env[k] && !(k.endsWith('ACCOUNT_ID') && accountId)) };

if (env.DATABASE_URL || env.SUPABASE_DB_URL || env.SUPABASE_DB_PASSWORD) {
  const pool = createPool();
  try {
    const src = new ProjectFilesInlineSource(pool);
    let cursor: string | undefined; let n = 0, bytes = 0, unrecoverable = 0;
    do { const page = await src.discover(cursor, 1000); for (const i of page.items) { n++; bytes += i.size ?? 0; if (i.blockedReason) unrecoverable++; } cursor = page.next; } while (cursor);
    out.project_files_inline = { rows: n, bytes, unrecoverable };
    const t = await pool.query(`select (select count(*) from public.project_files) total_rows, (select count(*) from public.project_files where storage_object_id is not null) linked, (select count(*) from public.project_files where file_url like 'data:%') data_url_rows`).catch((e: Error) => ({ rows: [{ error: e.message }] }));
    out.project_files = t.rows[0];
  } finally { await pool.end(); }
} else out.project_files_inline = { status: 'BLOCKED', missing: ['DATABASE_URL'] };

out.not_inventoried = { local_media_cache: 'EPHEMERAL: lives on the API machine; run on that machine with LocalMediaCacheSource', fly_volumes: 'no repository code persists to a Fly volume; confirm with `fly volumes list` (not run here)', token_buckets: 'xroga-github-tokens holds OAuth tokens: intentionally never inventoried or migrated as objects' };
console.log(JSON.stringify(out, null, 2));
