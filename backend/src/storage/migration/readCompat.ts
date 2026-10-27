import type { StorageService } from '../storageService.js';
import { StorageError, type StorageActor } from '../types.js';
import type { MigrationLedger } from './ledger.js';
import type { SourceProvider } from './types.js';

export type ReadSource = 'legacy' | 'r2';
export interface ReadResult { buffer: Buffer; contentType: string; from: ReadSource }

export interface ReadDeps {
  ledger: MigrationLedger;
  drive: StorageService;
  readLegacy: (key: string) => Promise<{ buffer: Buffer; contentType: string }>;
  order: ReadSource[];
  provider?: SourceProvider;
}

const NOT_AVAILABLE = (e: unknown): boolean =>
  e instanceof StorageError
    ? e.code === 'NOT_FOUND'
    : /NoSuchKey|R2 object empty|not found/i.test(`${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? ''}`);

/**
 * STORAGE_READ_ORDER-aware read of a LEGACY key. Both sources enforce the caller's identity:
 *  - r2: only a VERIFIED item switched to read_mode=new, owned by the actor, whose bytes re-hash to the verified SHA-256;
 *  - legacy: the key must live under the actor's own `users/{userId}/` prefix (the old layout's only ownership signal).
 * "Not migrated / not available" falls through to the next source. Integrity failures and ownership refusals do NOT:
 * silently serving the other copy would hide corruption or turn a refusal into a bypass.
 */
export async function readStoredFileOrdered(key: string, actor: StorageActor, d: ReadDeps): Promise<ReadResult> {
  let last: unknown = new StorageError('NOT_FOUND', 'file not found', 404);
  for (const src of d.order) {
    try {
      if (src === 'r2') {
        const item = await d.ledger.getItemBySource(d.provider ?? 'legacy_r2', key);
        if (!item || item.readMode !== 'new' || item.status !== 'VERIFIED' || !item.destinationObjectId) throw new StorageError('NOT_FOUND', 'not migrated', 404);
        if (item.ownerUserId !== actor.userId) throw new StorageError('FORBIDDEN', 'not your file', 403);
        const o = await d.drive.readObjectBytes(actor, item.destinationObjectId);
        return { buffer: o.bytes, contentType: o.contentType, from: 'r2' };
      }
      if (!key.startsWith(`users/${actor.userId}/`)) throw new StorageError('FORBIDDEN', 'not your file', 403);
      const l = await d.readLegacy(key);
      return { ...l, from: 'legacy' };
    } catch (err) {
      if (!NOT_AVAILABLE(err)) throw err;
      last = err;
    }
  }
  throw last;
}
