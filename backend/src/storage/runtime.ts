import pg from 'pg';
import { resolveDatabaseUrls } from '../lib/postgresConnect.js';
import { defaultPolicyConfig } from './policy.js';
import { PostgresStorageRepository } from './postgresRepository.js';
import { R2ObjectStore, r2ConfigFromEnv } from './r2ObjectStore.js';
import { StorageService } from './storageService.js';
import type { StorageActor } from './types.js';

/**
 * Where new durable writes go. `legacy` keeps today's behaviour exactly (default). `dual` and `r2` are opt-in and
 * are only switched on by an operator after the Phase 1 cutover approval; see docs/infra/batch-1.5/runbook-storage.md.
 */
export type StorageWriteMode = 'legacy' | 'dual' | 'r2';
export function storageWriteMode(env: NodeJS.ProcessEnv = process.env): StorageWriteMode {
  const v = (env.STORAGE_WRITE_MODE ?? 'legacy').toLowerCase();
  return v === 'dual' || v === 'r2' ? v : 'legacy';
}
export type StorageReadSource = 'legacy' | 'r2';
export function storageReadOrder(env: NodeJS.ProcessEnv = process.env): StorageReadSource[] {
  const order = (env.STORAGE_READ_ORDER ?? 'legacy,r2').split(',').map((s) => s.trim().toLowerCase()).filter((s): s is StorageReadSource => s === 'legacy' || s === 'r2');
  return order.length ? [...new Set(order)] : ['legacy', 'r2'];
}

let pool: pg.Pool | null = null;
let service: StorageService | null | undefined;

export function createPool(connectionString?: string): pg.Pool {
  const url = connectionString ?? resolveDatabaseUrls()[0];
  if (!url) throw new Error('No database URL configured');
  const local = /localhost|127\.0\.0\.1|sslmode=disable/.test(url);
  const p = new pg.Pool({ connectionString: url, max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000, ssl: local ? undefined : { rejectUnauthorized: false } });
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

/** Identity only ever comes from the authenticated request. tenant == user until Batch 1 TenantContext is accepted. */
export function actorFromUserId(userId: string): StorageActor {
  return { userId, tenantId: userId };
}
