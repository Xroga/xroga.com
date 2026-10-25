import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import type { ObjectStore } from '../objectStore.js';
import { isUuid } from '../keys.js';
import type { SqlClient } from '../postgresRepository.js';
import type { ObjectClass } from '../types.js';
import type { DiscoveredItem, OpenedSource, SourceAdapter } from './types.js';

/**
 * Buckets that hold credentials, not customer files. They are refused by construction: the ordinary object pipeline
 * must never carry OAuth tokens or provider secrets (see data-location-inventory.md, rows SEC-1..SEC-3).
 */
export const SECRET_BUCKETS: ReadonlySet<string> = new Set(['xroga-github-tokens']);

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|mp3|wav|ogg|m4a)$/i;
const classFor = (filename: string): ObjectClass => (MEDIA_EXT.test(filename) ? 'media' : 'artifact');
const guessType = (filename: string): string => {
  const e = filename.split('.').pop()?.toLowerCase() ?? '';
  const t: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', pdf: 'application/pdf', json: 'application/json', txt: 'text/plain', md: 'text/markdown' };
  return t[e] ?? 'application/octet-stream';
};

/** Legacy public-bucket layout written by lib/r2.ts buildR2Key: `users/{userId}/{timestamp}-{safeFilename}`. */
export class LegacyR2Source implements SourceAdapter {
  readonly provider = 'legacy_r2' as const;
  constructor(private readonly store: ObjectStore, private readonly bucket: string, private readonly prefix = 'users/') {}

  async discover(cursor: string | undefined, limit: number) {
    const page = await this.store.list(this.bucket, this.prefix, cursor, limit);
    const items: DiscoveredItem[] = page.keys.map((k) => {
      const m = /^users\/([0-9a-f-]{36})\/(\d{10,}-)?(.+)$/.exec(k.key);
      const filename = m ? m[3] : k.key.split('/').pop() ?? k.key;
      const owner = m && isUuid(m[1]) ? m[1] : null;
      return {
        sourceId: k.key, size: k.size, fingerprint: `${k.size}:${k.etag ?? ''}`, contentType: null, filename,
        ownerUserId: owner, projectId: null, objectClass: classFor(filename),
        blockedReason: owner ? undefined : 'UNPARSEABLE_LEGACY_KEY',
      };
    });
    return { items, next: page.next };
  }

  async open(sourceId: string): Promise<OpenedSource | null> {
    const head = await this.store.head(this.bucket, sourceId);
    if (!head) return null;
    return {
      size: head.size, fingerprint: `${head.size}:${head.etag ?? ''}`, contentType: head.contentType,
      body: () => this.store.openRead(this.bucket, sourceId),
    };
  }
}

export interface SupabaseStorageLike {
  list(bucket: string, folder: string, offset: number, limit: number): Promise<Array<{ name: string; size: number; etag?: string; isFolder: boolean }>>;
  download(bucket: string, path: string): Promise<Buffer | null>;
}

/** Supabase Storage bucket (e.g. `avatars`). Owner is taken from the first path segment only when it is a UUID. */
export class SupabaseStorageSource implements SourceAdapter {
  readonly provider = 'supabase_storage' as const;
  constructor(private readonly client: SupabaseStorageLike, private readonly bucket: string) {
    if (SECRET_BUCKETS.has(bucket)) throw new Error(`refusing to migrate secret bucket "${bucket}" as ordinary objects`);
  }
  async discover(cursor: string | undefined, limit: number) {
    // cursor = "<folder>|<offset>" for a breadth-first walk of one level of folders
    const [folder = '', off = '0'] = (cursor ?? '|0').split('|');
    const entries = await this.client.list(this.bucket, folder, Number(off), limit);
    const items: DiscoveredItem[] = [];
    for (const e of entries) {
      if (e.isFolder) continue;
      const full = folder ? `${folder}/${e.name}` : e.name;
      const first = full.split('/')[0];
      const owner = isUuid(first) ? first : null;
      items.push({
        sourceId: `${this.bucket}/${full}`, size: e.size, fingerprint: `${e.size}:${e.etag ?? ''}`, contentType: guessType(e.name), filename: e.name,
        ownerUserId: owner, projectId: null, objectClass: 'media', blockedReason: owner ? undefined : 'UNKNOWN_OWNER',
      });
    }
    return { items, next: entries.length === limit ? `${folder}|${Number(off) + limit}` : undefined };
  }
  async open(sourceId: string): Promise<OpenedSource | null> {
    const rel = sourceId.slice(this.bucket.length + 1);
    const buf = await this.client.download(this.bucket, rel);
    if (!buf) return null;
    return { size: buf.length, fingerprint: `${buf.length}:`, contentType: guessType(rel), body: async () => (async function* () { yield buf; })() };
  }
}

/** Rows of project_files whose only copy is inline text or a base64 data URL (the `local-fallback` path). */
export class ProjectFilesInlineSource implements SourceAdapter {
  readonly provider = 'project_files_inline' as const;
  constructor(private readonly db: SqlClient) {}

  async discover(cursor: string | undefined, limit: number) {
    const r = await this.db.query<{ id: string; file_name: string; file_type: string; file_url: string | null; content: string | null; user_id: string; project_id: string }>(
      `select pf.id, pf.file_name, pf.file_type, pf.file_url, pf.content, p.user_id, pf.project_id
         from public.project_files pf join public.projects p on p.id = pf.project_id
        where pf.storage_object_id is null and (pf.content is not null or pf.file_url like 'data:%')
          and ($1::uuid is null or pf.id > $1::uuid)
        order by pf.id limit $2`, [cursor ?? null, limit]);
    const items: DiscoveredItem[] = r.rows.map((x) => {
      const bytes = inlineBytes(x);
      return {
        sourceId: `project_files:${x.id}`, size: bytes ? bytes.length : null,
        fingerprint: bytes ? `${bytes.length}:${sha(bytes)}` : 'unrecoverable', contentType: guessType(x.file_name), filename: x.file_name,
        ownerUserId: x.user_id, projectId: x.project_id, objectClass: x.file_type === 'code' ? 'artifact' : 'media',
        blockedReason: bytes ? undefined : 'INLINE_CONTENT_NOT_RECOVERABLE',
      };
    });
    return { items, next: r.rows.length === limit ? r.rows[r.rows.length - 1].id : undefined };
  }

  async open(sourceId: string): Promise<OpenedSource | null> {
    const id = sourceId.replace(/^project_files:/, '');
    const r = await this.db.query<{ file_name: string; file_url: string | null; content: string | null }>('select file_name, file_url, content from public.project_files where id = $1', [id]);
    const row = r.rows[0];
    if (!row) return null;
    const bytes = inlineBytes(row);
    if (!bytes) return null;
    return { size: bytes.length, fingerprint: `${bytes.length}:${sha(bytes)}`, contentType: guessType(row.file_name), body: async () => (async function* () { yield bytes; })() };
  }
}


const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
function inlineBytes(x: { content: string | null; file_url: string | null }): Buffer | null {
  if (x.file_url?.startsWith('data:')) {
    const m = /^data:[^;,]*(;base64)?,(.*)$/s.exec(x.file_url);
    if (m) return m[1] ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2]));
  }
  return x.content != null ? Buffer.from(x.content, 'utf8') : null;
}

/**
 * `/tmp/xroga-media` cache written when R2 was unavailable. EPHEMERAL: lost on machine restart. Items are discovered so the
 * count is honest, and classified SKIPPED(EPHEMERAL_CACHE) unless the operator opts in to rescuing what is still on disk.
 */
export class LocalMediaCacheSource implements SourceAdapter {
  readonly provider = 'local_media_cache' as const;
  constructor(private readonly root: string) {}
  async discover(cursor: string | undefined, limit: number) {
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p); else if (!e.name.endsWith('.meta')) files.push(p);
      }
    };
    await walk(this.root);
    files.sort();
    const start = cursor ? files.findIndex((f) => f > cursor) : 0;
    if (start < 0) return { items: [] };
    const page = files.slice(start, start + limit);
    const items: DiscoveredItem[] = [];
    for (const f of page) {
      const st = await stat(f);
      const rel = path.relative(this.root, f);
      const m = /^users\/([0-9a-f-]{36})\//.exec(rel.split(path.sep).join('/'));
      items.push({ sourceId: rel.split(path.sep).join('/'), size: st.size, fingerprint: `${st.size}:${st.mtimeMs}`, contentType: null, filename: path.basename(f), ownerUserId: m && isUuid(m[1]) ? m[1] : null, projectId: null, objectClass: classFor(f), ephemeral: true });
    }
    return { items, next: start + limit < files.length ? page[page.length - 1] : undefined };
  }
  async open(sourceId: string): Promise<OpenedSource | null> {
    const f = path.join(this.root, sourceId);
    if (!path.resolve(f).startsWith(path.resolve(this.root) + path.sep)) return null;
    const st = await stat(f).catch(() => null);
    if (!st) return null;
    const ct = await readFile(`${f}.meta`, 'utf8').catch(() => 'application/octet-stream');
    return { size: st.size, fingerprint: `${st.size}:${st.mtimeMs}`, contentType: ct, body: async () => createReadStream(f) };
  }
}

// ---- artifacts embedded in swarm_runs.output ---------------------------------------------------------------------------

/** Names and content that mark a credential. Such "artifacts" are never copied into the ordinary object pipeline. */
const SECRET_NAME = /(^|[\/._-])(\.env|id_rsa|id_ed25519|credentials?|secrets?|tokens?|private[-_]?key|service[-_]?account)([\/._-]|$)|\.(pem|key|p12|pfx|kdbx)$/i;
const SECRET_CONTENT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bsk-[A-Za-z0-9_-]{24,}|\bAKIA[0-9A-Z]{16}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bvercel_[A-Za-z0-9]{20,}|\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
export const looksLikeCredential = (name: string, bytes: Buffer | null): boolean =>
  SECRET_NAME.test(name) || (bytes !== null && SECRET_CONTENT.test(bytes.subarray(0, 1024 * 1024).toString('latin1')));

type RunRow = { id: string; user_id: string; project_id: string | null; status: string; output: unknown };
interface EnvelopeArtifact { id?: unknown; name?: unknown; mediaType?: unknown; sizeBytes?: unknown; inline?: unknown; uri?: unknown }

/** Decodes a descriptor's `inline` payload: a `data:` URL (base64 or percent-encoded) or UTF-8 text. */
function inlineArtifactBytes(a: EnvelopeArtifact): Buffer | null {
  if (typeof a.inline !== 'string') return null;
  const m = /^data:[^;,]*(;base64)?,(.*)$/s.exec(a.inline);
  if (m) {
    try { return m[1] ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2])); } catch { return null; }
  }
  return Buffer.from(a.inline, 'utf8');
}

/**
 * Durable files that exist ONLY inside a finished run's JSON output: UniversalOutputEnvelope (`type: 'xroga.output'`) artifacts
 * whose descriptor carries `inline` bytes. Everything else in `swarm_runs.output` is metadata, not a file, and is classified, never copied:
 *  - EngineeringArtifact (`engineering_artifact`) is a manifest by design ("never file contents");
 *  - descriptors with only a local-path `uri`, or no payload at all, have no recoverable bytes (NO_RECOVERABLE_BYTES);
 *  - `drive://` descriptors are already canonical; http(s) descriptors are external.
 * Ownership comes from `swarm_runs.user_id` (never from the JSON); a run whose project belongs to someone else is refused at ingest.
 * The source row is only ever read.
 */
export class RunOutputArtifactsSource implements SourceAdapter {
  readonly provider = 'run_output_artifacts' as const;
  constructor(private readonly db: SqlClient) {}

  async discover(cursor: string | undefined, limit: number) {
    const r = await this.db.query<RunRow>(
      `select id, user_id, project_id, status, output from public.swarm_runs
        where output is not null and status in ('completed','failed') and ($1::uuid is null or id > $1::uuid)
        order by id limit $2`, [cursor ?? null, limit]);
    const items: DiscoveredItem[] = [];
    for (const run of r.rows) {
      const out = run.output as { type?: unknown; artifacts?: unknown } | null;
      if (!out || out.type !== 'xroga.output' || !Array.isArray(out.artifacts)) continue; // engineering_artifact etc.: metadata only
      const counts = new Map<string, number>();
      for (const a of out.artifacts as EnvelopeArtifact[]) if (a && typeof a.id === 'string') counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
      const emitted = new Set<string>();
      for (const raw of out.artifacts as EnvelopeArtifact[]) {
        if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.name !== 'string') continue;
        if (emitted.has(raw.id)) continue; // one ledger row per (run, artifact id); ambiguity is reported once, on that row
        emitted.add(raw.id);
        const sourceId = `swarm_runs:${run.id}#${raw.id}`;
        const name = raw.name.slice(0, 255);
        const mediaType = typeof raw.mediaType === 'string' ? raw.mediaType : 'application/octet-stream';
        const base = { sourceId, filename: name, contentType: mediaType, ownerUserId: run.user_id, projectId: run.project_id, objectClass: 'artifact' as ObjectClass };
        const bytes = inlineArtifactBytes(raw);
        let blockedReason: string | undefined;
        if ((counts.get(raw.id) ?? 0) > 1) blockedReason = 'DUPLICATE_ARTIFACT_ID';
        else if (typeof raw.uri === 'string' && /^drive:\/\//.test(raw.uri)) blockedReason = 'ALREADY_CANONICAL';
        else if (typeof raw.uri === 'string' && /^https?:\/\//.test(raw.uri) && !bytes) blockedReason = 'EXTERNAL_URI';
        else if (!bytes) blockedReason = 'NO_RECOVERABLE_BYTES';
        else if (looksLikeCredential(name, bytes)) blockedReason = 'CREDENTIAL_LIKE_CONTENT';
        else if (typeof raw.sizeBytes === 'number' && raw.sizeBytes !== bytes.length) blockedReason = 'DECLARED_SIZE_MISMATCH';
        items.push({ ...base, size: bytes ? bytes.length : null, fingerprint: bytes && !blockedReason ? `${bytes.length}:${sha(bytes)}` : `unrecoverable:${blockedReason}`, blockedReason });
      }
    }
    return { items, next: r.rows.length === limit ? r.rows[r.rows.length - 1].id : undefined };
  }

  async open(sourceId: string): Promise<OpenedSource | null> {
    const m = /^swarm_runs:([0-9a-f-]{36})#(.+)$/.exec(sourceId);
    if (!m) return null;
    const r = await this.db.query<RunRow>(`select id, user_id, project_id, status, output from public.swarm_runs where id = $1`, [m[1]]);
    const out = r.rows[0]?.output as { type?: unknown; artifacts?: unknown } | undefined;
    if (!out || out.type !== 'xroga.output' || !Array.isArray(out.artifacts)) return null;
    const matches = (out.artifacts as EnvelopeArtifact[]).filter((a) => a && a.id === m[2]);
    if (matches.length !== 1) return null; // gone, or ambiguous: never guess which duplicate is meant
    const bytes = inlineArtifactBytes(matches[0]);
    if (!bytes || looksLikeCredential(String(matches[0].name ?? ''), bytes)) return null;
    return { size: bytes.length, fingerprint: `${bytes.length}:${sha(bytes)}`, contentType: typeof matches[0].mediaType === 'string' ? matches[0].mediaType : null, body: async () => (async function* () { yield bytes; })() };
  }
}
