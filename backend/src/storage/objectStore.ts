/**
 * Provider operations only. No authorization, no metadata, no quota: those live in StorageService.
 * The public API never exposes this interface to callers outside the backend.
 */
export interface SignedRequest {
  url: string;
  method: 'PUT' | 'GET';
  /** headers the client MUST send for the signature to validate */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface HeadResult {
  size: number;
  etag: string | null;
  versionId: string | null;
  contentType: string | null;
  /** base64 SHA-256 if the provider recorded one at upload */
  checksumSha256: string | null;
}

export interface PresignPutInput {
  bucket: string;
  key: string;
  contentType: string;
  size: number;
  sha256Hex?: string | null;
  ttlSeconds: number;
}

export interface PresignGetInput {
  bucket: string;
  key: string;
  ttlSeconds: number;
  contentType: string;
  contentDisposition: string;
}

export interface CompletedPart { partNumber: number; etag: string }

export interface ObjectStore {
  readonly provider: 'r2' | 'memory';
  presignPut(i: PresignPutInput): Promise<SignedRequest>;
  presignGet(i: PresignGetInput): Promise<SignedRequest>;
  head(bucket: string, key: string): Promise<HeadResult | null>;
  /** First `length` bytes, for content sniffing. */
  readRange(bucket: string, key: string, start: number, length: number): Promise<Uint8Array>;
  /** Streaming read for hashing/copying. Never buffers the whole object. */
  openRead(bucket: string, key: string): Promise<AsyncIterable<Uint8Array>>;
  /** Bounded server-side write for artifacts the backend itself produced. */
  put(bucket: string, key: string, body: Buffer, contentType: string, sha256Hex: string): Promise<{ etag: string | null; versionId: string | null }>;
  /** Server-side streaming write (migration copy). */
  putStream(bucket: string, key: string, body: AsyncIterable<Uint8Array>, size: number, contentType: string): Promise<{ etag: string | null; versionId: string | null }>;
  delete(bucket: string, key: string): Promise<void>;
  createMultipart(bucket: string, key: string, contentType: string): Promise<{ uploadId: string }>;
  presignPart(bucket: string, key: string, uploadId: string, partNumber: number, ttlSeconds: number, contentLength: number): Promise<SignedRequest>;
  /** Server-side bounded part write (migration of large objects). `body` is at most one part; the provider returns the part's ETag (MD5 of the part on S3/R2). */
  uploadPart(bucket: string, key: string, uploadId: string, partNumber: number, body: Buffer): Promise<{ etag: string }>;
  listParts(bucket: string, key: string, uploadId: string): Promise<Array<{ partNumber: number; size: number; etag: string }>>;
  completeMultipart(bucket: string, key: string, uploadId: string, parts: CompletedPart[]): Promise<{ etag: string | null; versionId: string | null }>;
  abortMultipart(bucket: string, key: string, uploadId: string): Promise<void>;
  /** Keys under a prefix, for reconciliation and orphan discovery. */
  list(bucket: string, prefix: string, cursor?: string, limit?: number): Promise<{ keys: Array<{ key: string; size: number; etag?: string }>; next?: string }>;
}

/** Transient provider errors are retryable; everything else is a definitive answer. */
export class ProviderUnavailableError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}
