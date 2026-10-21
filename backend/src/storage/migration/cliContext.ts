import { createClient } from '@supabase/supabase-js';
import { createPool } from '../runtime.js';
import { defaultPolicyConfig } from '../policy.js';
import { PostgresStorageRepository } from '../postgresRepository.js';
import { R2ObjectStore, r2ConfigFromEnv } from '../r2ObjectStore.js';
import { StorageService } from '../storageService.js';
import { BlockedError } from './cli.js';
import { MigrationEngine, type ReadLinker } from './engine.js';
import { PostgresLedger } from './postgresLedger.js';
import { LegacyR2Source, ProjectFilesInlineSource, SupabaseStorageSource, type SupabaseStorageLike } from './sources.js';
import type { SourceAdapter, SourceProvider } from './types.js';

/** project_files link/unlink used by READ_NEW and its rollback. Touches only the additive storage_object_id column. */
const projectFilesLinker = (db: { query: (t: string, p?: unknown[]) => Promise<unknown> }): ReadLinker => ({
  link: async (it) => { await db.query(`update public.project_files set storage_object_id = $1 where (file_path = $2) or ('project_files:' || id::text = $2)`, [it.destinationObjectId, it.sourceId]); },
  unlink: async (it) => { await db.query(`update public.project_files set storage_object_id = null where storage_object_id = $1`, [it.destinationObjectId]); },
});

function legacyR2Config(env: NodeJS.ProcessEnv) {
  const accountId = env.CLOUDFLARE_R2_ACCOUNT_ID ?? env.CLOUDFLARE_ACCOUNT_ID;
  const missing = [['CLOUDFLARE_R2_ACCOUNT_ID', accountId], ['CLOUDFLARE_R2_ACCESS_KEY', env.CLOUDFLARE_R2_ACCESS_KEY], ['CLOUDFLARE_R2_SECRET_KEY', env.CLOUDFLARE_R2_SECRET_KEY]].filter(([, v]) => !v).map(([k]) => k as string);
  if (missing.length) throw new BlockedError(missing);
  return { accountId: accountId as string, accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY as string, secretAccessKey: env.CLOUDFLARE_R2_SECRET_KEY as string, bucket: env.CLOUDFLARE_R2_BUCKET ?? 'xroga-assets' };
}

export function supabaseStorageClient(env: NodeJS.ProcessEnv): SupabaseStorageLike {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new BlockedError(missing);
  const sb = createClient(env.SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    list: async (bucket, folder, offset, limit) => {
      const { data, error } = await sb.storage.from(bucket).list(folder, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw new Error(`supabase list failed: ${error.message}`);
      return (data ?? []).map((e) => ({ name: e.name, size: Number((e.metadata as { size?: number } | null)?.size ?? 0), etag: (e.metadata as { eTag?: string } | null)?.eTag, isFolder: e.id === null }));
    },
    download: async (bucket, p) => {
      const { data, error } = await sb.storage.from(bucket).download(p);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    },
  };
}

export interface BuiltContext { engine: MigrationEngine; ledger: PostgresLedger; drive: StorageService; destBucket: string; source: SourceAdapter; close: () => Promise<void> }

/** Builds the real (Postgres + R2) engine. Anything unconfigured raises BlockedError: the scripts report BLOCKED, never "ok". */
export function buildContext(provider: SourceProvider, opts: { worker: string; supabaseBucket?: string }, env: NodeJS.ProcessEnv = process.env): BuiltContext {
  const dest = r2ConfigFromEnv(env);
  if (!dest) throw new BlockedError(['XROGA_DRIVE_R2_ACCOUNT_ID', 'XROGA_DRIVE_R2_ACCESS_KEY_ID', 'XROGA_DRIVE_R2_SECRET_ACCESS_KEY', 'XROGA_DRIVE_R2_BUCKET']);
  if (!(env.DATABASE_URL || env.SUPABASE_DB_URL || env.SUPABASE_DB_PASSWORD)) throw new BlockedError(['DATABASE_URL']);
  const pool = createPool();
  const repo = new PostgresStorageRepository(pool);
  const ledger = new PostgresLedger(pool);
  const drive = new StorageService({ repo, store: new R2ObjectStore(dest), bucket: dest.bucket, policy: defaultPolicyConfig(env), quota: async () => null });
  let source: SourceAdapter;
  if (provider === 'legacy_r2') { const l = legacyR2Config(env); source = new LegacyR2Source(new R2ObjectStore(l), l.bucket, env.LEGACY_R2_PREFIX ?? 'users/'); }
  else if (provider === 'supabase_storage') source = new SupabaseStorageSource(supabaseStorageClient(env), opts.supabaseBucket ?? 'avatars');
  else if (provider === 'project_files_inline') source = new ProjectFilesInlineSource(pool);
  else throw new BlockedError([`adapter for ${provider} (use the dedicated script)`]);
  const engine = new MigrationEngine({ ledger, source, drive, destRepo: repo, worker: opts.worker, linker: projectFilesLinker(pool) });
  return { engine, ledger, drive, destBucket: dest.bucket, source, close: () => pool.end() };
}
