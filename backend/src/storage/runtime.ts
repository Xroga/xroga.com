import pg from 'pg';
import { resolveDatabaseUrls } from '../lib/postgresConnect.js';
import { planDatabaseConnection } from './databaseTls.js';
import { createTenantContext, requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import { defaultPolicyConfig } from './policy.js';
import { PostgresStorageRepository } from './postgresRepository.js';
import { R2ObjectStore, r2ConfigFromEnv } from './r2ObjectStore.js';
import { StorageService } from './storageService.js';
import { PostgresLedger } from './migration/postgresLedger.js';
import type { StorageActor } from './types.js';

/**
 * Where new durable writes go. `legacy` keeps today's behaviour exactly (the default when unset). `dual` and `r2` are opt-in and
 * are only switched on by an operator after the Phase 1 cutover approval; see docs/infra/batch-1.5/runbook-storage.md.
 * A value that is set but not understood is a configuration ERROR, never silently treated as `legacy`.
 */
export type StorageWriteMode = 'legacy' | 'dual' | 'r2';
export type StorageReadSource = 'legacy' | 'r2';

export class StorageConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`invalid storage configuration: ${problems.join('; ')}`);
    this.name = 'StorageConfigError';
  }
}

export interface ResolvedStorageConfig {
  writeMode: StorageWriteMode;
  readOrder: StorageReadSource[];
  problems: string[];
}

/** Pure: validates the combination of switches and credentials without touching the network. */
export function resolveStorageConfig(env: NodeJS.ProcessEnv = process.env): ResolvedStorageConfig {
  const problems: string[] = [];
  const rawMode = env.STORAGE_WRITE_MODE?.trim().toLowerCase();
  let writeMode: StorageWriteMode = 'legacy';
  if (rawMode) {
    if (rawMode === 'legacy' || rawMode === 'dual' || rawMode === 'r2') writeMode = rawMode;
    else problems.push(`STORAGE_WRITE_MODE="${rawMode.slice(0, 20)}" is not one of legacy|dual|r2`);
  }
  const rawOrder = env.STORAGE_READ_ORDER?.trim().toLowerCase();
  let readOrder: StorageReadSource[] = ['legacy', 'r2'];
  if (rawOrder) {
    const parts = rawOrder.split(',').map((x) => x.trim());
    const bad = parts.filter((x) => x !== 'legacy' && x !== 'r2');
    if (bad.length || !parts.length) problems.push(`STORAGE_READ_ORDER contains unsupported source(s): ${bad.map((b) => `"${b.slice(0, 12)}"`).join(',') || '(empty)'}`);
    else if (new Set(parts).size !== parts.length) problems.push('STORAGE_READ_ORDER lists a source twice');
    else readOrder = parts as StorageReadSource[];
  }
  const needsDrive = writeMode !== 'legacy' || rawOrder === 'r2';
  if (needsDrive) {
    if (!(env.XROGA_DRIVE_R2_ACCESS_KEY_ID && env.XROGA_DRIVE_R2_SECRET_ACCESS_KEY && env.XROGA_DRIVE_R2_BUCKET && (env.XROGA_DRIVE_R2_ACCOUNT_ID ?? env.CLOUDFLARE_R2_ACCOUNT_ID ?? env.CLOUDFLARE_ACCOUNT_ID))) {
      problems.push(`${writeMode !== 'legacy' ? `STORAGE_WRITE_MODE=${writeMode}` : 'STORAGE_READ_ORDER=r2'} requires XROGA_DRIVE_R2_* credentials and bucket`);
    }
    if (env.XROGA_DRIVE_R2_BUCKET && env.XROGA_DRIVE_R2_BUCKET === (env.CLOUDFLARE_R2_BUCKET ?? 'xroga-assets')) {
      problems.push('XROGA_DRIVE_R2_BUCKET must be a dedicated private bucket, not the legacy assets bucket');
    }
    if (!(env.DATABASE_URL || env.SUPABASE_DB_URL || env.SUPABASE_DB_PASSWORD)) problems.push('canonical storage requires a database URL');
  }
  return { writeMode, readOrder, problems };
}

/** Throws StorageConfigError for an invalid combination: callers fail closed instead of picking a default. */
export function storageWriteMode(env: NodeJS.ProcessEnv = process.env): StorageWriteMode {
  const c = resolveStorageConfig(env);
  if (c.problems.length) throw new StorageConfigError(c.problems);
  return c.writeMode;
}
export function storageReadOrder(env: NodeJS.ProcessEnv = process.env): StorageReadSource[] {
  const c = resolveStorageConfig(env);
  if (c.problems.length) throw new StorageConfigError(c.problems);
  return c.readOrder;
}

let pool: pg.Pool | null = null;
let service: StorageService | null | undefined;

/**
 * The storage pool. TLS policy lives in databaseTls.ts: loopback is plain, every other host is certificate-verified (custom CA,
 * the pinned Supabase root, or the platform store), and the URL is never passed to pg as a connection string so a `sslmode=` in
 * DATABASE_URL cannot weaken it. An unusable policy throws, and getStorageService() then reports Drive as unavailable.
 */
export function createPool(connectionString?: string): pg.Pool {
  const url = connectionString ?? resolveDatabaseUrls()[0];
  if (!url) throw new Error('No database URL configured');
  const plan = planDatabaseConnection(url);
  const p = new pg.Pool({ ...plan.config, max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  p.on('error', (e) => console.warn('[storage] idle pool client error:', e.message));
  return p;
}

/** Null when the private R2 bucket or the database is not configured: callers must treat that as "Drive unavailable". */
export function getStorageService(): StorageService | null {
  if (service !== undefined) return service;
  try {
    const cfg = r2ConfigFromEnv();
    if (!cfg || !resolveDatabaseUrls().length) { service = null; return service; }
    pool = createPool();
    const quotaEnv = process.env.STORAGE_QUOTA_BYTES;
    const quota = quotaEnv && /^\d+$/.test(quotaEnv) ? Number(quotaEnv) : null;
    service = new StorageService({
      repo: new PostgresStorageRepository(pool), store: new R2ObjectStore(cfg), bucket: cfg.bucket,
      policy: defaultPolicyConfig(), quota: async () => quota,
    });
  } catch (err) {
    console.warn('[storage] Xroga Drive not available:', (err as Error).message);
    service = null;
  }
  return service;
}

/** Test seam. */
export function setStorageServiceForTests(s: StorageService | null | undefined) { service = s; }

/**
 * Identity only ever comes from a TenantContext that Batch 1's `createTenantContext` issued (the auth middleware for requests, the persisted owner for
 * background work). A plain object, a parsed body or a cloned job payload is refused by `requireTenantContext`, so a caller cannot invent a tenant.
 * `tenantId` is whatever the context says; today it equals the user id, and Drive's ownership checks are already keyed on it.
 */
export function actorFromTenantContext(context: TenantContext): StorageActor {
  const { userId, tenantId } = requireTenantContext(context);
  return { userId, tenantId };
}

/** For operator tools that act for one persisted owner (migrations): the same issued-context path, never a bare user id. */
export function actorFromPersistedOwner(userId: string): StorageActor {
  return actorFromTenantContext(createTenantContext({ userId, via: 'persisted_owner' }));
}

/** Migration ledger on the same pool (only meaningful when Drive itself is configured). */
export function getMigrationLedger(): PostgresLedger | null {
  return getStorageService() && pool ? new PostgresLedger(pool) : null;
}
