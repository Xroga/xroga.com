import { StorageError, type ObjectClass } from './types.js';

/** Single-PUT ceiling. Above this the caller must use multipart. R2 allows 5 GiB per PUT; stay well under. */
export const SINGLE_PUT_MAX_BYTES = 100 * 1024 * 1024;
/** Multipart part sizing: R2/S3 minimum is 5 MiB (except the last part), maximum 10,000 parts. */
export const MULTIPART_PART_BYTES = 16 * 1024 * 1024;
export const MULTIPART_MIN_PART_BYTES = 5 * 1024 * 1024;
export const MULTIPART_MAX_PARTS = 10_000;
/** Hard per-object ceiling. Not a published product limit: operators lower it through StoragePolicyConfig. */
export const DEFAULT_MAX_OBJECT_BYTES = 5 * 1024 * 1024 * 1024;

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 60;
export const MAX_DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
export const RESERVATION_TTL_SECONDS = 60 * 60;
export const MULTIPART_RESERVATION_TTL_SECONDS = 24 * 60 * 60;

export interface StoragePolicyConfig {
  maxObjectBytes: number;
  singlePutMaxBytes: number;
  multipartPartBytes: number;
}

export function defaultPolicyConfig(env: NodeJS.ProcessEnv = process.env): StoragePolicyConfig {
  const n = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);
  return {
    maxObjectBytes: n(env.STORAGE_MAX_OBJECT_BYTES, DEFAULT_MAX_OBJECT_BYTES),
    singlePutMaxBytes: Math.min(n(env.STORAGE_SINGLE_PUT_MAX_BYTES, SINGLE_PUT_MAX_BYTES), 4 * 1024 * 1024 * 1024),
    multipartPartBytes: Math.max(n(env.STORAGE_MULTIPART_PART_BYTES, MULTIPART_PART_BYTES), MULTIPART_MIN_PART_BYTES),
  };
}

/** Executables are not product file types for customer uploads. Server-generated classes are exempt. */
const BLOCKED_EXTENSIONS = new Set(['exe', 'dll', 'msi', 'scr', 'com', 'pif', 'cpl', 'jar', 'apk', 'dmg', 'app', 'vbs', 'ps1']);
const BLOCKED_TYPES = new Set([
  'application/x-msdownload', 'application/x-dosexec', 'application/x-msi', 'application/vnd.microsoft.portable-executable',
  'application/x-executable', 'application/x-mach-binary', 'application/java-archive', 'application/vnd.android.package-archive',
]);

/** Types a browser can execute script from: never served inline from a download URL, always as attachments. */
const ACTIVE_TYPES = new Set([
  'text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml', 'text/javascript',
  'application/javascript', 'application/x-javascript', 'text/css',
]);
/** Types considered safe to display inline in the browser. */
const INLINE_SAFE = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg|webm)|text\/plain)$/;

export function normalizeContentType(raw: string): string {
  const base = String(raw ?? '').split(';')[0].trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]{0,60}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,100}$/.test(base)) {
    throw new StorageError('INVALID_REQUEST', 'invalid content type');
  }
  return base;
}

export interface UploadRequestCheck {
  objectClass: ObjectClass;
  contentType: string;
  size: number;
  filename: string;
  /** server-originated writes (artifacts, evidence) skip customer-upload extension blocking */
  serverGenerated?: boolean;
}

export function validateUploadRequest(req: UploadRequestCheck, cfg: StoragePolicyConfig): { contentType: string } {
  const contentType = normalizeContentType(req.contentType);
  if (!Number.isSafeInteger(req.size) || req.size < 0) throw new StorageError('INVALID_REQUEST', 'size must be a non-negative integer');
  if (req.size > cfg.maxObjectBytes) throw new StorageError('POLICY_REJECTED', 'object exceeds the maximum allowed size', 413);
  if (!req.serverGenerated) {
    const ext = req.filename.split('.').pop()?.toLowerCase() ?? '';
    if (BLOCKED_EXTENSIONS.has(ext) || BLOCKED_TYPES.has(contentType)) {
      throw new StorageError('POLICY_REJECTED', 'this file type is not accepted');
    }
  }
  return { contentType };
}

/** Magic-byte detection for the formats where a mismatch is a meaningful signal. */
export function sniffContentType(head: Uint8Array): string | null {
  const b = head;
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (b.length >= 6 && (at(0, 0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || at(0, 0x47, 0x49, 0x46, 0x38, 0x39, 0x61))) return 'image/gif';
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (b.length >= 5 && at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  if (b.length >= 4 && (at(0, 0x50, 0x4b, 0x03, 0x04) || at(0, 0x50, 0x4b, 0x05, 0x06))) return 'application/zip';
  if (b.length >= 2 && at(0, 0x4d, 0x5a)) return 'application/x-msdownload'; // PE executable
  if (b.length >= 4 && at(0, 0x7f, 0x45, 0x4c, 0x46)) return 'application/x-executable'; // ELF
  return null;
}

export type SniffVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Compare the declared type with what the bytes look like. Executables are always refused; a declared
 * image/pdf/zip whose signature disagrees is refused. Plain text-like declared types are not sniffed.
 */
export function checkContentMatchesDeclaration(declared: string, head: Uint8Array, serverGenerated = false): SniffVerdict {
  const seen = sniffContentType(head);
  if (seen && BLOCKED_TYPES.has(seen) && !serverGenerated) return { ok: false, reason: 'EXECUTABLE_CONTENT' };
  const strict = /^(image\/(png|jpeg|gif|webp)|application\/(pdf|zip))$/;
  if (strict.test(declared) && seen !== declared) return { ok: false, reason: 'CONTENT_TYPE_MISMATCH' };
  // zip-based office/epub/apk containers legitimately sniff as zip
  if (/^application\/vnd\.openxmlformats|^application\/epub\+zip/.test(declared) && seen !== 'application/zip') {
    return { ok: false, reason: 'CONTENT_TYPE_MISMATCH' };
  }
  return { ok: true };
}

export interface SafeDownloadHeaders {
  contentType: string;
  contentDisposition: string;
  /** Applied by our proxy/redirect layer where we control headers; R2 presign carries the first two. */
  extra: Record<string, string>;
}

/** Content-Disposition filename is RFC 5987 encoded from the sanitized name. */
export function safeDownloadHeaders(contentType: string, safeFilename: string): SafeDownloadHeaders {
  const active = ACTIVE_TYPES.has(contentType) || !INLINE_SAFE.test(contentType);
  const type = active ? (ACTIVE_TYPES.has(contentType) ? 'application/octet-stream' : contentType) : contentType;
  const disposition = `${active ? 'attachment' : 'inline'}; filename="${safeFilename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
  return {
    contentType: type,
    contentDisposition: disposition,
    extra: { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" },
  };
}

export function multipartPlan(size: number, cfg: StoragePolicyConfig): { partSize: number; parts: number } {
  const parts = Math.max(1, Math.ceil(size / cfg.multipartPartBytes));
  if (parts > MULTIPART_MAX_PARTS) throw new StorageError('POLICY_REJECTED', 'object is too large for the configured part size', 413);
  return { partSize: cfg.multipartPartBytes, parts };
}
