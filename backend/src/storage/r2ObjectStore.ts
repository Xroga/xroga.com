import {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand, ListObjectsV2Command, type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { hexToBase64 } from './integrity.js';
import {
  ProviderUnavailableError, type CompletedPart, type HeadResult, type ObjectStore,
  type PresignGetInput, type PresignPutInput, type SignedRequest,
} from './objectStore.js';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Private canonical bucket. Must NOT be the legacy public assets bucket. */
  bucket: string;
  /**
   * Ask the provider to enforce the exact Content-Length through the signature. Cloudflare's examples sign only host and content-type, so
   * whether R2 accepts a signed content-length is verified by the provider suite; set XROGA_DRIVE_PRESIGN_SIGN_LENGTH=0 if it does not.
   * Server-side verification before READY is authoritative either way.
   */
  signContentLength?: boolean;
}

/**
 * Canonical private bucket configuration. Distinct env names from the legacy `CLOUDFLARE_R2_*` variables
 * so the legacy public bucket can never be selected by accident. Returns null when unconfigured.
 */
export function r2ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  const accountId = env.XROGA_DRIVE_R2_ACCOUNT_ID ?? env.CLOUDFLARE_R2_ACCOUNT_ID ?? env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = env.XROGA_DRIVE_R2_ACCESS_KEY_ID;
  const secretAccessKey = env.XROGA_DRIVE_R2_SECRET_ACCESS_KEY;
  const bucket = env.XROGA_DRIVE_R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const legacy = env.CLOUDFLARE_R2_BUCKET ?? 'xroga-assets';
  if (bucket === legacy) throw new Error('XROGA_DRIVE_R2_BUCKET must be a dedicated private bucket, not the legacy assets bucket');
  return { accountId, accessKeyId, secretAccessKey, bucket, signContentLength: env.XROGA_DRIVE_PRESIGN_SIGN_LENGTH !== '0' };
}

const TRANSIENT_NAMES = new Set(['TimeoutError', 'RequestTimeout', 'NetworkingError', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE']);

/** Network failures and 5xx/429/408 are retryable; everything else is a definitive answer from the provider. */
export function isTransient(err: unknown): boolean {
  const e = err as { name?: string; code?: string; $metadata?: { httpStatusCode?: number }; cause?: { code?: string; name?: string } };
  const s = e?.$metadata?.httpStatusCode;
  if (s !== undefined && (s >= 500 || s === 429 || s === 408)) return true;
  return [e?.name, e?.code, e?.cause?.code, e?.cause?.name].some((x) => x !== undefined && TRANSIENT_NAMES.has(x));
}

function wrap<T>(p: Promise<T>): Promise<T> {
  return p.catch((err) => {
    if (isTransient(err)) throw new ProviderUnavailableError('object store temporarily unavailable');
    throw err;
  });
}

export class R2ObjectStore implements ObjectStore {
  readonly provider = 'r2' as const;
  readonly #s3: S3Client;
  readonly #signLength: boolean;
  readonly #bucket: string;

  constructor(cfg: R2Config, client?: S3Client) {
    if(!/^[A-Za-z0-9]{1,64}$/.test(cfg.accountId))throw new Error('Invalid R2 account identifier.');
    if(typeof cfg.bucket!=='string'||!cfg.bucket)throw new Error('Missing configured private bucket.');
    this.#bucket=cfg.bucket;
    const opts: S3ClientConfig = {
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3,
      followRegionRedirects: false,
    };
    this.#s3 = client ?? new S3Client(opts);
    this.#signLength = cfg.signContentLength !== false;
  }

  #assertBucket(bucket:string):void {
    if(bucket!==this.#bucket)throw Object.assign(new Error('The operation requires its configured private bucket.'),{code:'R2_SCOPE_DENIED',retryable:false});
  }

  async presignPut(i: PresignPutInput): Promise<SignedRequest> {
    this.#assertBucket(i.bucket);
    const headers: Record<string, string> = { 'Content-Type': i.contentType };
    const input: ConstructorParameters<typeof PutObjectCommand>[0] = {
      Bucket: i.bucket, Key: i.key, ContentType: i.contentType, ContentLength: i.size,
    };
    const unhoistable = new Set<string>();
    if (i.sha256Hex) {
      input.ChecksumSHA256 = hexToBase64(i.sha256Hex);
      headers['x-amz-checksum-sha256'] = input.ChecksumSHA256;
      unhoistable.add('x-amz-checksum-sha256');
    }
    const url = await getSignedUrl(this.#s3, new PutObjectCommand(input), {
      expiresIn: i.ttlSeconds,
      signableHeaders: new Set(this.#signLength ? ['content-type', 'content-length'] : ['content-type']),
      unhoistableHeaders: unhoistable,
    });
    return { url, method: 'PUT', headers, expiresAt: new Date(Date.now() + i.ttlSeconds * 1000) };
  }

  async presignGet(i: PresignGetInput): Promise<SignedRequest> {
    this.#assertBucket(i.bucket);
    const url = await getSignedUrl(
      this.#s3,
      new GetObjectCommand({
        Bucket: i.bucket, Key: i.key,
        ResponseContentType: i.contentType, ResponseContentDisposition: i.contentDisposition,
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: i.ttlSeconds },
    );
    return { url, method: 'GET', headers: {}, expiresAt: new Date(Date.now() + i.ttlSeconds * 1000) };
  }

  async head(bucket: string, key: string): Promise<HeadResult | null> {
    this.#assertBucket(bucket);
    try {
      const r = await wrap(this.#s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: 'ENABLED' })));
      return {
        size: Number(r.ContentLength ?? 0), etag: r.ETag ?? null, versionId: r.VersionId ?? null,
        contentType: r.ContentType ?? null, checksumSha256: r.ChecksumSHA256 ?? null,
      };
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async readRange(bucket: string, key: string, start: number, length: number): Promise<Uint8Array> {
    this.#assertBucket(bucket);
    const r = await wrap(this.#s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${start + length - 1}` })));
    return r.Body ? r.Body.transformToByteArray() : new Uint8Array();
  }

  async openRead(bucket: string, key: string): Promise<AsyncIterable<Uint8Array>> {
    this.#assertBucket(bucket);
    const r = await wrap(this.#s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })));
    if (!r.Body) throw new Error('empty body');
    return r.Body as unknown as AsyncIterable<Uint8Array>;
  }

  async put(bucket: string, key: string, body: Buffer, contentType: string, sha256Hex: string) {
    this.#assertBucket(bucket);
    const r = await wrap(this.#s3.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.length,
      ChecksumSHA256: hexToBase64(sha256Hex),
    })));
    return { etag: r.ETag ?? null, versionId: r.VersionId ?? null };
  }

  async putStream(bucket: string, key: string, body: AsyncIterable<Uint8Array>, size: number, contentType: string) {
    this.#assertBucket(bucket);
    const { Readable } = await import('node:stream');
    const r = await wrap(this.#s3.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: Readable.from(body), ContentType: contentType, ContentLength: size,
    })));
    return { etag: r.ETag ?? null, versionId: r.VersionId ?? null };
  }

  async delete(bucket: string, key: string): Promise<void> {
    this.#assertBucket(bucket);
    await wrap(this.#s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })));
  }

  async createMultipart(bucket: string, key: string, contentType: string) {
    this.#assertBucket(bucket);
    const r = await wrap(this.#s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType })));
    if (!r.UploadId) throw new Error('no upload id');
    return { uploadId: r.UploadId };
  }

  async presignPart(bucket: string, key: string, uploadId: string, partNumber: number, ttlSeconds: number, contentLength: number): Promise<SignedRequest> {
    this.#assertBucket(bucket);
    const url = await getSignedUrl(
      this.#s3,
      new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, ContentLength: contentLength }),
      { expiresIn: ttlSeconds, signableHeaders: this.#signLength ? new Set(['content-length']) : undefined },
    );
    return { url, method: 'PUT', headers: {}, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  async uploadPart(bucket: string, key: string, uploadId: string, partNumber: number, body: Buffer) {
    this.#assertBucket(bucket);
    const r = await wrap(this.#s3.send(new UploadPartCommand({
      Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body, ContentLength: body.length,
    })));
    if (!r.ETag) throw new Error('provider returned no part ETag');
    return { etag: r.ETag };
  }

  async listParts(bucket: string, key: string, uploadId: string) {
    this.#assertBucket(bucket);
    const out: Array<{ partNumber: number; size: number; etag: string }> = [];
    let marker: string | undefined;
    for (;;) {
      const r = await wrap(this.#s3.send(new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker })));
      for (const p of r.Parts ?? []) out.push({ partNumber: p.PartNumber ?? 0, size: Number(p.Size ?? 0), etag: p.ETag ?? '' });
      if (!r.IsTruncated) return out;
      marker = r.NextPartNumberMarker;
    }
  }

  async completeMultipart(bucket: string, key: string, uploadId: string, parts: CompletedPart[]) {
    this.#assertBucket(bucket);
    const r = await wrap(this.#s3.send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: key, UploadId: uploadId,
      MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    })));
    return { etag: r.ETag ?? null, versionId: r.VersionId ?? null };
  }

  async abortMultipart(bucket: string, key: string, uploadId: string) {
    this.#assertBucket(bucket);
    try {
      await wrap(this.#s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId })));
    } catch (err) {
      if ((err as { name?: string })?.name !== 'NoSuchUpload') throw err;
    }
  }

  async list(bucket: string, prefix: string, cursor?: string, limit = 1000) {
    this.#assertBucket(bucket);
    const r = await wrap(this.#s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: cursor, MaxKeys: limit })));
    return {
      keys: (r.Contents ?? []).map((o) => ({ key: o.Key ?? '', size: Number(o.Size ?? 0), etag: o.ETag })),
      next: r.IsTruncated ? r.NextContinuationToken : undefined,
    };
  }
}
