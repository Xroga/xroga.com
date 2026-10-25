import { createHash, randomUUID } from 'node:crypto';
import type { DiscoveredItem, OpenedSource, SourceAdapter } from '../migration/types.js';

/**
 * Deterministic synthetic source: byte i of the object is a pure function of (seed, revision, i), so a multi-GiB "customer file"
 * exists only as a stream. SYNTHETIC test data: no real object, nothing stored in the source.
 */
export class GeneratedSource implements SourceAdapter {
  readonly provider = 'legacy_r2' as const;
  readonly owner = randomUUID();
  /** bumped by tests to simulate the source changing underneath a copy */
  revision = 0;
  /** invoked once after `afterBytes` bytes were produced by a body() stream (to inject faults mid-transfer) */
  hook: { afterBytes: number; fn: () => void } | null = null;
  constructor(readonly sizes: Record<string, number>, readonly seed = 7) {}

  byte(i: number): number { return (Math.imul(i, 2654435761) + this.seed + this.revision) >>> 13 & 0xff; }
  chunk(start: number, len: number): Buffer {
    const b = Buffer.allocUnsafe(len);
    for (let k = 0; k < len; k++) b[k] = this.byte(start + k);
    return b;
  }
  /** expected SHA-256 of the whole object, computed by streaming (never materialised) */
  sha256(id: string, step = 1 << 20): string {
    const h = createHash('sha256'); const size = this.sizes[id];
    for (let o = 0; o < size; o += step) h.update(this.chunk(o, Math.min(step, size - o)));
    return h.digest('hex');
  }
  fingerprint(id: string) { return `${this.sizes[id]}:${this.seed}:${this.revision}`; }
  async discover(_cursor: string | undefined, _limit: number) {
    const items: DiscoveredItem[] = Object.entries(this.sizes).map(([id, size]) => ({
      sourceId: id, size, fingerprint: this.fingerprint(id), contentType: 'application/octet-stream', filename: `${id}.bin`,
      ownerUserId: this.owner, projectId: null, objectClass: 'artifact',
    }));
    return { items };
  }
  async open(id: string): Promise<OpenedSource | null> {
    const size = this.sizes[id];
    if (size === undefined) return null;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      size, fingerprint: this.fingerprint(id), contentType: 'application/octet-stream',
      body: async () => (async function* () {
        const step = 256 * 1024; let emitted = 0; let fired = false;
        for (let o = 0; o < size; o += step) {
          const c = self.chunk(o, Math.min(step, size - o));
          emitted += c.length; yield c;
          if (self.hook && !fired && emitted >= self.hook.afterBytes) { fired = true; self.hook.fn(); }
        }
      })(),
    };
  }
}
