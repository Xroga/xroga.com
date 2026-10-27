import type { DriveApi, DriveObject, SignedPart } from '@/lib/driveApi';

/**
 * Browser side of an Xroga Drive upload. The API only plans and verifies: it hands out short-lived signed URLs, the bytes go
 * directly to private object storage, and the object is READY only after the API has read it back and checked size and hash.
 *
 *   small file      one signed PUT
 *   large file      the API says how many parts; they are signed in batches just before they are sent, uploaded a few at a time,
 *                   each retried on its own, then completed with the ETags the storage returned
 *
 * Nothing here decides that a file is stored: `completeUpload` returns the recorded object and that is what the caller shows.
 */

export type UploadFailureCode = 'PUT_FAILED' | 'ETAG_UNREADABLE' | 'ABORTED' | 'EMPTY_PART_LIST';

export class UploadError extends Error {
  constructor(readonly code: UploadFailureCode, message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export interface UploadProgress { sentBytes: number; totalBytes: number }

export interface UploadOptions {
  projectId?: string | null;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploaderDeps {
  api: Pick<DriveApi, 'initiateUpload' | 'signParts' | 'completeUpload'>;
  fetch?: typeof fetch;
  /** Hex SHA-256 of the file, or null to let the server compute it. Files too large to hash in memory return null. */
  sha256?: (file: Blob) => Promise<string | null>;
  partConcurrency?: number;
  maxPartAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Hashing needs the whole file in memory; above this the server's own verification is the check. */
export const MAX_CLIENT_HASH_BYTES = 64 * 1024 * 1024;
const SIGN_BATCH = 100;

export async function sha256Hex(file: Blob): Promise<string | null> {
  if (file.size > MAX_CLIENT_HASH_BYTES || typeof crypto === 'undefined' || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function uploadFile(file: File, deps: UploaderDeps, options: UploadOptions = {}): Promise<DriveObject> {
  const send = deps.fetch ?? fetch;
  const total = file.size;
  const aborted = () => { if (options.signal?.aborted) throw new UploadError('ABORTED', 'The upload was cancelled.'); };
  aborted();

  const sha256 = await (deps.sha256 ?? sha256Hex)(file);
  aborted();
  const initiated = await deps.api.initiateUpload({
    projectId: options.projectId ?? null, filename: file.name, contentType: file.type || 'application/octet-stream', size: total, ...(sha256 ? { sha256 } : {}),
  });

  if (initiated.mode === 'single') {
    const response = await send(initiated.upload.url, { method: initiated.upload.method, headers: initiated.upload.headers, body: file, signal: options.signal }).catch((error) => {
      if (options.signal?.aborted) throw new UploadError('ABORTED', 'The upload was cancelled.');
      throw error;
    });
    if (!response.ok) throw new UploadError('PUT_FAILED', 'The file could not be sent to storage. Try again.');
    options.onProgress?.({ sentBytes: total, totalBytes: total });
    return deps.api.completeUpload(initiated.objectId);
  }

  const { partSize, parts: partCount } = initiated;
  const etags = new Map<number, string>();
  let sent = 0;
  const attempts = deps.maxPartAttempts ?? 3;
  const sleep = deps.sleep ?? wait;

  const sendPart = async (part: SignedPart) => {
    const start = (part.partNumber - 1) * partSize;
    const body = file.slice(start, start + part.contentLength);
    for (let attempt = 1; ; attempt++) {
      aborted();
      try {
        const response = await send(part.url, { method: part.method, headers: part.headers, body, signal: options.signal });
        if (!response.ok) throw new UploadError('PUT_FAILED', 'A part of the file could not be sent to storage.');
        const etag = response.headers.get('etag');
        if (!etag) throw new UploadError('ETAG_UNREADABLE', 'Storage did not return a part receipt. Its CORS settings must expose the ETag header.');
        etags.set(part.partNumber, etag);
        sent += part.contentLength;
        options.onProgress?.({ sentBytes: sent, totalBytes: total });
        return;
      } catch (error) {
        if (options.signal?.aborted) throw new UploadError('ABORTED', 'The upload was cancelled.');
        // a missing receipt is a configuration problem a retry cannot fix
        if ((error instanceof UploadError && error.code === 'ETAG_UNREADABLE') || attempt >= attempts) throw error;
        await sleep(250 * 2 ** (attempt - 1));
      }
    }
  };

  const numbers = Array.from({ length: partCount }, (_, i) => i + 1);
  if (numbers.length === 0) throw new UploadError('EMPTY_PART_LIST', 'The upload plan had no parts.');
  const concurrency = Math.max(1, deps.partConcurrency ?? 3);
  for (let offset = 0; offset < numbers.length; offset += SIGN_BATCH) {
    aborted();
    // signed just before use: a signed URL is short-lived
    const { parts } = await deps.api.signParts(initiated.objectId, numbers.slice(offset, offset + SIGN_BATCH));
    const queue = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    let failed = false;
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      // one failed part stops the others from sending more
      for (let part = queue.shift(); part && !failed; part = queue.shift()) {
        try { await sendPart(part); } catch (error) { failed = true; throw error; }
      }
    }));
  }
  return deps.api.completeUpload(initiated.objectId, [...etags].sort(([a], [b]) => a - b).map(([partNumber, etag]) => ({ partNumber, etag })));
}
