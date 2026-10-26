import { createHash } from 'node:crypto';

import type { ProjectFile } from '../ai/patches.js';
import {
  BuilderError,
  MAX_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_FILES,
  type ChangeSummary,
} from './types.js';

/** Files that must never become durable project source or leave the platform. */
const SECRET_PATH = /(^|\/)(\.env(\..*)?|\.npmrc|id_rsa|id_ed25519|.*\.pem|.*\.p12|credentials\.json)$/i;
const ALLOWED_ENV_EXAMPLE = /(^|\/)\.env\.(example|sample|template)$/i;
const SECRET_CONTENT =
  /(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|sbp_[a-f0-9]{30,}|sb_secret_[A-Za-z0-9_-]{20,}|SUPABASE_SERVICE_ROLE_KEY\s*=\s*eyJ|AKIA[0-9A-Z]{16}|(?:sk|rk)_live_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{35})/;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

/**
 * A Supabase service-role key is a JWT whose payload says role "service_role". The anon (public) key is also a JWT and is
 * legitimate in source, so a token is judged by what it claims, not by its shape.
 */
export function containsServiceRoleJwt(content: string): boolean {
  for (const match of content.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')) as { role?: unknown };
      if (payload.role === 'service_role') return true;
    } catch {
      // not a JWT after all
    }
  }
  return false;
}

export const looksLikeSecret = (content: string): boolean => SECRET_CONTENT.test(content) || containsServiceRoleJwt(content);

export function isSafeProjectPath(path: string): boolean {
  if (!path || path.length > 300 || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  return !path.split('/').some((part) => part === '..' || part === '' || part === '.git');
}

/**
 * Validates a complete file set before it is made durable. Throws, never silently drops:
 * a snapshot that omitted a file would be a false "saved" claim.
 */
export function assertSnapshotAcceptable(files: readonly ProjectFile[]): void {
  if (files.length === 0) throw new BuilderError('invalid_input', 'A source snapshot must contain at least one file.');
  if (files.length > MAX_SNAPSHOT_FILES) throw new BuilderError('too_large', `A snapshot is limited to ${MAX_SNAPSHOT_FILES} files.`);
  const seen = new Set<string>();
  let bytes = 0;
  for (const file of files) {
    if (!isSafeProjectPath(file.path)) throw new BuilderError('invalid_input', `Unsafe project path rejected: ${JSON.stringify(file.path.slice(0, 80))}`);
    if (seen.has(file.path)) throw new BuilderError('invalid_input', `Duplicate path in snapshot: ${file.path}`);
    seen.add(file.path);
    if (SECRET_PATH.test(file.path) && !ALLOWED_ENV_EXAMPLE.test(file.path)) {
      throw new BuilderError('invalid_input', `Refusing to store a credential-bearing file: ${file.path}`);
    }
    if (looksLikeSecret(file.content)) {
      throw new BuilderError('invalid_input', `Refusing to store source containing credential material: ${file.path}`);
    }
    bytes += Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_SNAPSHOT_BYTES) throw new BuilderError('too_large', `A snapshot is limited to ${MAX_SNAPSHOT_BYTES} bytes.`);
  }
}

export function snapshotBytes(files: readonly ProjectFile[]): number {
  return files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0);
}

/** Order-independent content hash: sha256 over sorted (path, length, content) records. */
export function hashSnapshot(files: readonly ProjectFile[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(`${file.path}\0${Buffer.byteLength(file.content, 'utf8')}\0`);
    hash.update(file.content);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function diffSnapshots(before: readonly ProjectFile[], after: readonly ProjectFile[]): ChangeSummary {
  const prior = new Map(before.map((file) => [file.path, file.content]));
  const next = new Map(after.map((file) => [file.path, file.content]));
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const [path, content] of next) {
    if (!prior.has(path)) created.push(path);
    else if (prior.get(path) !== content) modified.push(path);
  }
  for (const path of prior.keys()) if (!next.has(path)) deleted.push(path);
  return { created: created.sort(), modified: modified.sort(), deleted: deleted.sort() };
}
