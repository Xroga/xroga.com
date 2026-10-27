import { createHash } from 'node:crypto';
import { hashStream, isSha256Hex, sha256Hex } from './integrity.js';
import { assertKeyMatchesIdentity, buildObjectKey, isUuid, newObjectId, sanitizeFilename } from './keys.js';
import { ProviderUnavailableError, type CompletedPart, type ObjectStore } from './objectStore.js';
import {
  checkContentMatchesDeclaration, DOWNLOAD_URL_TTL_SECONDS, MAX_DOWNLOAD_URL_TTL_SECONDS, MULTIPART_RESERVATION_TTL_SECONDS,
  MULTIPART_MAX_PARTS, MULTIPART_MIN_PART_BYTES, multipartPlan, RESERVATION_TTL_SECONDS, safeDownloadHeaders, UPLOAD_URL_TTL_SECONDS, validateUploadRequest,
  type StoragePolicyConfig,
} from './policy.js';
import type { StorageRepository } from './repository.js';
import { StorageError, type ObjectClass, type ObjectState, type StorageActor, type StorageObject } from './types.js';

/** Resolves the tenant's persistent-storage allowance in bytes, or null for "tracked but not limited". */
export type QuotaResolver = (actor: StorageActor) => Promise<number | null>;

export interface StorageServiceDeps {
  repo: StorageRepository;
  store: ObjectStore;
  bucket: string;
  policy: StoragePolicyConfig;
  quota?: QuotaResolver;
  now?: () => Date;
}

export interface PublicObject {
  id: string; projectId: string | null; objectClass: ObjectClass; filename: string; contentType: string;
  size: number | null; sha256: string | null; state: ObjectState; createdAt: string;
}

export function toPublicObject(o: StorageObject): PublicObject {
  return {
    id: o.id, projectId: o.projectId, objectClass: o.objectClass, filename: o.safeFilename, contentType: o.contentType,
    size: o.sizeBytes, sha256: o.sha256Verified, state: o.state, createdAt: o.createdAt.toISOString(),
  };
}

export interface InitiateUploadInput {
  projectId?: string | null;
  filename: string;
  contentType: string;
  size: number;
  sha256?: string | null;
}

export type InitiateUploadResult =
  | { objectId: string; mode: 'single'; upload: { method: 'PUT'; url: string; headers: Record<string, string>; expiresAt: string } }
  | { objectId: string; mode: 'multipart'; partSize: number; parts: number; expiresAt: string };

export interface ReconcileReport {
  expiredReservations: number;
  abandonedCleaned: number;
  reverified: number;
  deletionsFinished: number;
  missingObjects: Array<{ objectId: string }>;
  orphanKeys: string[];
  usageDrift: Array<{ tenantId: string; before: { reserved: number; committed: number }; after: { reserved: number; committed: number } }>;
  errors: Array<{ objectId: string; code: string }>;
}

const VERIFY_STALE_MS = 5 * 60 * 1000;

export class StorageService {
  readonly #repo: StorageRepository;
  readonly #store: ObjectStore;
  readonly #bucket: string;
  readonly #policy: StoragePolicyConfig;
  readonly #quota: QuotaResolver;
  readonly #now: () => Date;

  constructor(d: StorageServiceDeps) {
    this.#repo = d.repo; this.#store = d.store; this.#bucket = d.bucket; this.#policy = d.policy;
    this.#quota = d.quota ?? (async () => null);
    this.#now = d.now ?? (() => new Date());
  }

  // ---- authorization helpers --------------------------------------------------------------------

  /** Tenant AND owner must match; otherwise the object does not exist as far as the caller can tell. */
  async #owned(actor: StorageActor, objectId: string): Promise<StorageObject> {
    if (!isUuid(objectId)) throw new StorageError('NOT_FOUND', 'object not found', 404);
    const o = await this.#repo.getObject(objectId);
    if (!o || o.tenantId !== actor.tenantId || o.ownerUserId !== actor.userId) throw new StorageError('NOT_FOUND', 'object not found', 404);
    assertKeyMatchesIdentity(o);
    // Saved object ownership cannot preserve access after the project changes owner.
    // All user-facing object operations, including completion and part signing,
    // must admit the project's current owner before using provider capabilities.
    await this.#authorizeProject(actor, o.projectId);
    return o;
  }

  /** Revocation-sensitive: the project's CURRENT owner is read from the database on every call. */
  async #authorizeProject(actor: StorageActor, projectId: string | null): Promise<void> {
    if (projectId === null) return;
    if (!isUuid(projectId)) throw new StorageError('INVALID_REQUEST', 'invalid project id');
    const owner = await this.#repo.getProjectOwner(projectId);
    if (!owner || owner !== actor.userId) throw new StorageError('NOT_FOUND', 'project not found', 404);
  }

  /** Signing/audit I/O cannot extend an earlier ownership or object-state check.
   * This guards publication of a new capability, not revocation of an already
   * delivered presigned URL, which keeps its existing bounded expiry.
   */
  async #assertCapabilityCurrent(actor:StorageActor,expected:StorageObject,state:ObjectState):Promise<void>{
    const current=await this.#owned(actor,expected.id);
    if(current.state==='DELETING'||current.state==='DELETED'||(state==='READY'&&current.state!=='READY'))throw new StorageError('NOT_FOUND','object is not available',404);
    if(current.state!==state||(['bucket','objectKey','projectId','contentType','safeFilename','declaredSize','sha256Verified','sizeBytes','multipartUploadId'] as const)
      .some(key=>current[key]!==expected[key])||current.uploadExpiresAt?.getTime()!==expected.uploadExpiresAt?.getTime())
      throw new StorageError('CONFLICT','the object changed while its capability was being prepared',409);
    if(state==='UPLOADING'&&current.uploadExpiresAt&&current.uploadExpiresAt<=this.#now())throw new StorageError('EXPIRED','upload expired',410);
  }

  async #audit(actor: StorageActor | null, o: StorageObject | null, action: string, outcome: string, detail: Record<string, unknown> = {}) {
    try {
      await this.#repo.audit({ tenantId: actor?.tenantId ?? o?.tenantId ?? null, actorUserId: actor?.userId ?? null, objectId: o?.id ?? null, action, outcome, detail });
    } catch { /* audit must never break the storage operation */ }
  }

  // ---- upload ------------------------------------------------------------------------------------

  async initiateUpload(actor: StorageActor, input: InitiateUploadInput, opts: { objectClass?: ObjectClass; serverGenerated?: boolean } = {}): Promise<InitiateUploadResult> {
    const objectClass = opts.objectClass ?? 'upload';
    const projectId = input.projectId ?? null;
    await this.#authorizeProject(actor, projectId);
    const { contentType } = validateUploadRequest({ objectClass, contentType: input.contentType, size: input.size, filename: input.filename, serverGenerated: opts.serverGenerated }, this.#policy);
    if (input.sha256 != null && !isSha256Hex(input.sha256)) throw new StorageError('INVALID_REQUEST', 'sha256 must be 64 lowercase hex characters');

    const id = newObjectId();
    const safeFilename = sanitizeFilename(input.filename);
    const multipart = input.size > this.#policy.singlePutMaxBytes;
    const now = this.#now();
    const ttl = multipart ? MULTIPART_RESERVATION_TTL_SECONDS : RESERVATION_TTL_SECONDS;
    const expires = new Date(now.getTime() + ttl * 1000);
    const obj = await this.#repo.insertObject({
      id, tenantId: actor.tenantId, ownerUserId: actor.userId, projectId, objectClass, originalFilename: String(input.filename).slice(0, 255),
      safeFilename, provider: this.#store.provider, bucket: this.#bucket,
      objectKey: buildObjectKey({ tenantId: actor.tenantId, projectId, objectClass, objectId: id, safeFilename }),
      contentType, declaredSize: input.size, sha256Declared: input.sha256 ?? null, uploadMode: multipart ? 'multipart' : 'single', uploadExpiresAt: expires,
    });

    const reserved = await this.#repo.reserve(id, actor.tenantId, input.size, expires, await this.#quota(actor));
    if (reserved === 'QUOTA_EXCEEDED') {
      await this.#repo.updateObject(id, ['PENDING'], { state: 'FAILED', errorCode: 'QUOTA_EXCEEDED' });
      await this.#audit(actor, obj, 'upload.initiate', 'quota_exceeded');
      throw new StorageError('QUOTA_EXCEEDED', 'storage quota exceeded', 413);
    }

    let createdUpload:string|undefined;
    try {
      // Quota resolution and reservation can wait on locks. Do not issue a
      // provider capability using the project snapshot from before that wait.
      await this.#authorizeProject(actor, projectId);
      if (multipart) {
        const plan = multipartPlan(input.size, this.#policy);
        const { uploadId } = await this.#store.createMultipart(this.#bucket, obj.objectKey, contentType);
        createdUpload=uploadId;
        const current=await this.#repo.updateObject(id, ['PENDING'], { state: 'UPLOADING', multipartUploadId: uploadId });
        if(!current)throw new StorageError('CONFLICT','the upload changed during preparation',409);
        await this.#audit(actor, obj, 'upload.initiate', 'ok', { mode: 'multipart', parts: plan.parts });
        await this.#assertCapabilityCurrent(actor,current,'UPLOADING');
        return { objectId: id, mode: 'multipart', partSize: plan.partSize, parts: plan.parts, expiresAt: expires.toISOString() };
      }
      const signed = await this.#store.presignPut({ bucket: this.#bucket, key: obj.objectKey, contentType, size: input.size, sha256Hex: input.sha256 ?? null, ttlSeconds: UPLOAD_URL_TTL_SECONDS });
      const current=await this.#repo.updateObject(id, ['PENDING'], { state: 'UPLOADING' });
      if(!current)throw new StorageError('CONFLICT','the upload changed during preparation',409);
      await this.#audit(actor, obj, 'upload.initiate', 'ok', { mode: 'single' });
      await this.#assertCapabilityCurrent(actor,current,'UPLOADING');
      return { objectId: id, mode: 'single', upload: { method: 'PUT', url: signed.url, headers: signed.headers, expiresAt: signed.expiresAt.toISOString() } };
    } catch (err) {
      // Only the upload created by this attempt is disposable. Keep its ID in
      // the failed row for the existing reconciler if provider cleanup fails.
      if(createdUpload)await this.#store.abortMultipart(this.#bucket,obj.objectKey,createdUpload).catch(()=>undefined);
      await this.#repo.updateObject(id, ['PENDING', 'UPLOADING'], { state: 'FAILED', errorCode: 'INITIATE_FAILED' }).catch(() => null);
      await this.#repo.release(id).catch(() => null);
      if (err instanceof ProviderUnavailableError) throw new StorageError('PROVIDER_UNAVAILABLE', 'storage temporarily unavailable', 503);
      throw err;
    }
  }

  async signUploadParts(actor: StorageActor, objectId: string, partNumbers: number[]) {
    const o = await this.#owned(actor, objectId);
    if (o.state !== 'UPLOADING' || o.uploadMode !== 'multipart' || !o.multipartUploadId) throw new StorageError('BAD_STATE', 'object is not in a multipart upload', 409);
    if (o.uploadExpiresAt && o.uploadExpiresAt <= this.#now()) throw new StorageError('EXPIRED', 'upload expired', 410);
    const plan = multipartPlan(o.declaredSize, this.#policy);
    if (!partNumbers.length || partNumbers.length > 100 || partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > plan.parts)) {
      throw new StorageError('INVALID_REQUEST', 'invalid part numbers');
    }
    const signed=await Promise.all(partNumbers.map(async (n) => {
      const len = n < plan.parts ? plan.partSize : o.declaredSize - plan.partSize * (plan.parts - 1);
      const s = await this.#store.presignPart(o.bucket, o.objectKey, o.multipartUploadId as string, n, UPLOAD_URL_TTL_SECONDS, len);
      return { partNumber: n, method: s.method, url: s.url, headers: s.headers, expiresAt: s.expiresAt.toISOString(), contentLength: len };
    }));
    await this.#assertCapabilityCurrent(actor,o,'UPLOADING');
    return signed;
  }

  /** Idempotent. Never reports READY unless size and SHA-256 were verified against the stored bytes. */
  async completeUpload(actor: StorageActor, objectId: string, input: { parts?: CompletedPart[] } = {}): Promise<PublicObject> {
    const o = await this.#owned(actor, objectId);
    if (o.state === 'READY') return toPublicObject(o);
    if (!['PENDING', 'UPLOADING', 'VERIFYING'].includes(o.state)) {
      throw new StorageError(o.state === 'QUARANTINED' ? 'QUARANTINED' : o.state === 'CORRUPT' ? 'CORRUPT' : 'BAD_STATE', `object is ${o.state.toLowerCase()}`, 409);
    }
    try {
      if (o.uploadMode === 'multipart') await this.#completeMultipartIfNeeded(actor,o, input.parts);
      return toPublicObject(await this.#verifyAndAdmit(o, actor));
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw new StorageError('PROVIDER_UNAVAILABLE', 'storage temporarily unavailable; retry', 503);
      throw err;
    }
  }

  async #completeMultipartIfNeeded(actor:StorageActor,o: StorageObject, parts: CompletedPart[] | undefined): Promise<void> {
    // A previous attempt may have completed the multipart upload and then crashed: the object exists, the upload id is gone.
    const existing = await this.#store.head(o.bucket, o.objectKey);
    if (existing) return;
    if (!o.multipartUploadId) throw new StorageError('UPLOAD_MISSING', 'no multipart upload in progress', 409);
    const plan = multipartPlan(o.declaredSize, this.#policy);
    if (!parts || parts.length !== plan.parts) throw new StorageError('INVALID_REQUEST', 'wrong number of parts');
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    if (ordered.some((p, i) => p.partNumber !== i + 1 || !p.etag)) throw new StorageError('INVALID_REQUEST', 'parts must be contiguous from 1');
    const stored = await this.#store.listParts(o.bucket, o.objectKey, o.multipartUploadId);
    const byNo = new Map(stored.map((p) => [p.partNumber, p]));
    let total = 0;
    for (const p of ordered) {
      const s = byNo.get(p.partNumber);
      if (!s || s.etag !== p.etag) throw new StorageError('INVALID_REQUEST', `part ${p.partNumber} missing or etag mismatch`);
      total += s.size;
    }
    if (total !== o.declaredSize) throw new StorageError('SIZE_MISMATCH', 'uploaded parts do not add up to the declared size');
    await this.#assertCapabilityCurrent(actor,o,o.state);
    await this.#store.completeMultipart(o.bucket, o.objectKey, o.multipartUploadId, ordered);
  }

  /** Verification pipeline shared by browser uploads, multipart, server-side writes and migration. */
  async #verifyAndAdmit(o: StorageObject, actor: StorageActor | null): Promise<StorageObject> {
    const head = await this.#store.head(o.bucket, o.objectKey);
    if (!head) throw new StorageError('UPLOAD_MISSING', 'upload not found; retry the upload', 409);

    let cur = (await this.#repo.updateObject(o.id, ['PENDING', 'UPLOADING', 'VERIFYING'], { state: 'VERIFYING' })) ?? (await this.#repo.getObject(o.id));
    if (!cur) throw new StorageError('NOT_FOUND', 'object not found', 404);
    if (cur.state === 'READY') return cur;
    if (cur.state !== 'VERIFYING') throw new StorageError('BAD_STATE', `object is ${cur.state.toLowerCase()}`, 409);

    const fail = async (to: 'QUARANTINED' | 'CORRUPT', code: string, result: Record<string, unknown>) => {
      await this.#repo.updateObject(cur!.id, ['VERIFYING'], { state: to, errorCode: code, verificationResult: { ...result, at: this.#now().toISOString() } });
      await this.#repo.release(cur!.id);
      await this.#audit(actor, cur, 'upload.verify', code.toLowerCase());
      throw new StorageError(to === 'CORRUPT' ? 'CORRUPT' : 'QUARANTINED', code === 'SIZE_MISMATCH' ? 'uploaded size does not match the declared size' : `upload rejected: ${code.toLowerCase()}`, 422);
    };

    if (head.size !== cur.declaredSize) await fail('QUARANTINED', 'SIZE_MISMATCH', { declared: cur.declaredSize, actual: head.size });

    const head4k = await this.#store.readRange(cur.bucket, cur.objectKey, 0, 4096);
    const verdict = checkContentMatchesDeclaration(cur.contentType, head4k, cur.objectClass !== 'upload');
    if (!verdict.ok) await fail('QUARANTINED', verdict.reason, {});

    const { sha256, size } = await hashStream(await this.#store.openRead(cur.bucket, cur.objectKey));
    if (size !== cur.declaredSize) await fail('QUARANTINED', 'SIZE_MISMATCH', { declared: cur.declaredSize, actual: size });
    if (cur.sha256Declared && sha256 !== cur.sha256Declared) await fail('CORRUPT', 'CHECKSUM_MISMATCH', { declared: cur.sha256Declared, actual: sha256 });

    // Read-back verification can outlive project access. Reconciliation acts
    // for the saved owner and must obey the same current project ownership.
    await this.#authorizeProject(actor ?? { userId: cur.ownerUserId, tenantId: cur.tenantId }, cur.projectId);
    const c = await this.#repo.commit(cur.id, size);
    if (c === 'NO_RESERVATION' || c === 'RESERVATION_LOST') {
      // reservation expired while the upload was in flight: take it again (quota is re-checked), then commit
      const r = await this.#repo.reserve(cur.id, cur.tenantId, size, new Date(this.#now().getTime() + RESERVATION_TTL_SECONDS * 1000), await this.#quota({ userId: cur.ownerUserId, tenantId: cur.tenantId }));
      if (r === 'QUOTA_EXCEEDED') {
        await this.#repo.updateObject(cur.id, ['VERIFYING'], { state: 'FAILED', errorCode: 'QUOTA_EXCEEDED' });
        throw new StorageError('QUOTA_EXCEEDED', 'storage quota exceeded', 413);
      }
      const again = await this.#repo.commit(cur.id, size);
      if (again !== 'OK' && again !== 'ALREADY_COMMITTED') throw new StorageError('CONFLICT', `quota commit failed: ${again}`, 409);
    } else if (c !== 'OK' && c !== 'ALREADY_COMMITTED') {
      throw new StorageError('CONFLICT', `quota commit failed: ${c}`, 409);
    }

    const ready = await this.#repo.updateObject(cur.id, ['VERIFYING'], {
      state: 'READY', sizeBytes: size, sha256Verified: sha256, verifiedAt: this.#now(), providerVersion: head.versionId ?? head.etag ?? null,
      errorCode: null, errorDetail: null, verificationResult: { size, sha256, providerChecksumPresent: head.checksumSha256 !== null, method: 'readback-sha256' },
    });
    const final = ready ?? (await this.#repo.getObject(cur.id));
    if (!final || final.state !== 'READY') throw new StorageError('CONFLICT', 'object changed state during verification', 409);
    await this.#audit(actor, final, 'upload.verify', 'ready', { size });
    return final;
  }

  /**
   * Server-side write for artifacts the backend itself produced (documents, screenshots, evidence).
   * The same verification applies: success is reported only after read-back SHA-256 matches.
   * A provider timeout is NOT success: the object is left UPLOADING and reconcile settles it.
   */
  async putServerObject(actor: StorageActor, input: { projectId?: string | null; objectClass: ObjectClass; filename: string; contentType: string; body: Buffer }): Promise<PublicObject> {
    if (input.body.length > this.#policy.singlePutMaxBytes) throw new StorageError('POLICY_REJECTED', 'artifact too large for a single server write', 413);
    const sha = sha256Hex(input.body);
    const init = await this.initiateUpload(actor, { projectId: input.projectId, filename: input.filename, contentType: input.contentType, size: input.body.length, sha256: sha }, { objectClass: input.objectClass, serverGenerated: true });
    if (init.mode !== 'single') throw new StorageError('POLICY_REJECTED', 'artifact too large for a single server write', 413);
    const o = (await this.#repo.getObject(init.objectId)) as StorageObject;
    try {
      await this.#store.put(o.bucket, o.objectKey, input.body, o.contentType, sha);
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        // possibly written: only an authoritative head() can say. Never claim success, never delete blindly.
        const h = await this.#store.head(o.bucket, o.objectKey).catch(() => null);
        if (!h) throw new StorageError('PROVIDER_UNAVAILABLE', 'artifact write did not complete', 503);
      } else {
        await this.#repo.updateObject(o.id, ['PENDING', 'UPLOADING'], { state: 'FAILED', errorCode: 'PUT_FAILED' }).catch(() => null);
        await this.#repo.release(o.id).catch(() => null);
        throw err;
      }
    }
    return toPublicObject(await this.#verifyAndAdmit(o, actor));
  }

  /**
   * Migration ingest. Same pipeline as every other write (key, reservation, provider write, read-back SHA-256, READY) with:
   *  - a caller-supplied deterministic object id, so replays and concurrent workers converge on one destination row;
   *  - quota ACCOUNTED but not enforced (legacy data was never metered; refusing migration would strand customer files);
   *  - a streaming body (never buffered).
   * Returns `reused: true` when the destination was already READY (idempotent replay).
   */
  async ingestLegacy(actor: StorageActor, input: {
    objectId: string; projectId?: string | null; objectClass: ObjectClass; filename: string; contentType: string; size: number;
    body: () => Promise<AsyncIterable<Uint8Array>>; migrationJobId: string; legacySource: Record<string, unknown>;
  }): Promise<{ object: StorageObject; reused: boolean }> {
    if (!isUuid(input.objectId)) throw new StorageError('INVALID_REQUEST', 'invalid object id');
    const projectId = input.projectId ?? null;
    if (projectId) await this.#authorizeProject(actor, projectId);
    const { contentType } = validateUploadRequest({ objectClass: input.objectClass, contentType: input.contentType, size: input.size, filename: input.filename, serverGenerated: true }, this.#policy);
    const safeFilename = sanitizeFilename(input.filename);
    let o = await this.#repo.getObject(input.objectId);
    if (o) {
      if (o.tenantId !== actor.tenantId || o.ownerUserId !== actor.userId) throw new StorageError('FORBIDDEN', 'destination belongs to another tenant', 403);
      if (o.state === 'READY') return { object: o, reused: true };
      if (['DELETING', 'DELETED', 'CORRUPT', 'QUARANTINED', 'FAILED'].includes(o.state)) throw new StorageError('BAD_STATE', `destination is ${o.state.toLowerCase()}`, 409);
    } else {
      const expires = new Date(this.#now().getTime() + MULTIPART_RESERVATION_TTL_SECONDS * 1000);
      o = await this.#repo.insertObject({
        id: input.objectId, tenantId: actor.tenantId, ownerUserId: actor.userId, projectId, objectClass: input.objectClass,
        originalFilename: String(input.filename).slice(0, 255), safeFilename, provider: this.#store.provider, bucket: this.#bucket,
        objectKey: buildObjectKey({ tenantId: actor.tenantId, projectId, objectClass: input.objectClass, objectId: input.objectId, safeFilename }),
        contentType, declaredSize: input.size, sha256Declared: null, uploadMode: 'single', uploadExpiresAt: expires,
        migrationJobId: input.migrationJobId, legacySource: input.legacySource,
      });
    }
    const expires = new Date(this.#now().getTime() + MULTIPART_RESERVATION_TTL_SECONDS * 1000);
    await this.#repo.reserve(o.id, o.tenantId, o.declaredSize, expires, null);
    if (o.state === 'PENDING') o = (await this.#repo.updateObject(o.id, ['PENDING'], { state: 'UPLOADING' })) ?? o;
    try {
      await this.#store.putStream(o.bucket, o.objectKey, await input.body(), o.declaredSize, o.contentType);
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        const h = await this.#store.head(o.bucket, o.objectKey).catch(() => null);
        if (!h) throw new StorageError('PROVIDER_UNAVAILABLE', 'destination write did not complete', 503);
      } else {
        throw err;
      }
    }
    return { object: await this.#verifyAndAdmit(o, actor), reused: false };
  }

  /**
   * Migration ingest for objects too large for one streaming PUT. Same identity, quota and verification pipeline as ingestLegacy, but the
   * provider write is a server-driven multipart upload:
   *  - memory is bounded by (concurrency + 1) parts, never by object size;
   *  - the upload id is persisted on the destination row, so a restarted worker resumes the SAME upload;
   *  - on resume the source is re-streamed from byte 0 and every already-stored part is trusted only if its size and ETag (MD5 on S3/R2)
   *    equal the MD5 of the bytes the source produces NOW; any other part is rewritten, so a changed source cannot be stitched together;
   *  - completion is followed by the usual read-back SHA-256 (multipart ETags are never treated as a content hash).
   */
  async ingestLegacyMultipart(actor: StorageActor, input: {
    objectId: string; projectId?: string | null; objectClass: ObjectClass; filename: string; contentType: string; size: number;
    body: () => Promise<AsyncIterable<Uint8Array>>; migrationJobId: string; legacySource: Record<string, unknown>;
    partBytes?: number; concurrency?: number; partTimeoutMs?: number; signal?: AbortSignal;
  }): Promise<{ object: StorageObject; reused: boolean }> {
    if (!isUuid(input.objectId)) throw new StorageError('INVALID_REQUEST', 'invalid object id');
    const projectId = input.projectId ?? null;
    if (projectId) await this.#authorizeProject(actor, projectId);
    const { contentType } = validateUploadRequest({ objectClass: input.objectClass, contentType: input.contentType, size: input.size, filename: input.filename, serverGenerated: true }, this.#policy);
    const safeFilename = sanitizeFilename(input.filename);
    const partBytes = Math.max(input.partBytes ?? this.#policy.multipartPartBytes, MULTIPART_MIN_PART_BYTES);
    const parts = Math.max(1, Math.ceil(input.size / partBytes));
    if (parts > MULTIPART_MAX_PARTS) throw new StorageError('POLICY_REJECTED', 'object is too large for the configured part size', 413);
    const concurrency = Math.max(1, Math.min(input.concurrency ?? 2, 8));
    const partTimeoutMs = input.partTimeoutMs ?? 120_000;

    let o = await this.#repo.getObject(input.objectId);
    if (o) {
      if (o.tenantId !== actor.tenantId || o.ownerUserId !== actor.userId) throw new StorageError('FORBIDDEN', 'destination belongs to another tenant', 403);
      if (o.state === 'READY') return { object: o, reused: true };
      if (['DELETING', 'DELETED', 'CORRUPT', 'QUARANTINED', 'FAILED'].includes(o.state)) throw new StorageError('BAD_STATE', `destination is ${o.state.toLowerCase()}`, 409);
    } else {
      const expires = new Date(this.#now().getTime() + MULTIPART_RESERVATION_TTL_SECONDS * 1000);
      o = await this.#repo.insertObject({
        id: input.objectId, tenantId: actor.tenantId, ownerUserId: actor.userId, projectId, objectClass: input.objectClass,
        originalFilename: String(input.filename).slice(0, 255), safeFilename, provider: this.#store.provider, bucket: this.#bucket,
        objectKey: buildObjectKey({ tenantId: actor.tenantId, projectId, objectClass: input.objectClass, objectId: input.objectId, safeFilename }),
        contentType, declaredSize: input.size, sha256Declared: null, uploadMode: 'multipart', uploadExpiresAt: expires,
        migrationJobId: input.migrationJobId, legacySource: input.legacySource,
      });
    }
    if (o.declaredSize !== input.size) throw new StorageError('CONFLICT', 'source size differs from the size admitted for this destination', 409);
    await this.#repo.reserve(o.id, o.tenantId, o.declaredSize, new Date(this.#now().getTime() + MULTIPART_RESERVATION_TTL_SECONDS * 1000), null);
    if (o.state === 'PENDING') o = (await this.#repo.updateObject(o.id, ['PENDING'], { state: 'UPLOADING' })) ?? o;

    // A previous attempt may already have completed the provider object (then crashed before admitting it).
    const alreadyComplete = await this.#store.head(o.bucket, o.objectKey);
    if (!alreadyComplete) {
      // resume the persisted upload when the provider still knows it; otherwise start a fresh one
      let uploadId = o.multipartUploadId;
      let stored = new Map<number, { size: number; etag: string }>();
      if (uploadId) {
        try { stored = new Map((await this.#store.listParts(o.bucket, o.objectKey, uploadId)).map((p) => [p.partNumber, p])); } catch { uploadId = null; }
      }
      if (!uploadId) {
        uploadId = (await this.#store.createMultipart(o.bucket, o.objectKey, o.contentType)).uploadId;
        const saved = await this.#repo.updateObject(o.id, ['UPLOADING'], { multipartUploadId: uploadId });
        if (saved && saved.multipartUploadId !== uploadId) { await this.#store.abortMultipart(o.bucket, o.objectKey, uploadId).catch(() => null); uploadId = saved.multipartUploadId; }
      }
      const done: CompletedPart[] = [];
      const inflight = new Set<Promise<void>>();
      let firstError: unknown = null;
      let total = 0;
      let n = 0;
      const withTimeout = <T>(p: Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new ProviderUnavailableError('part upload timed out')), partTimeoutMs);
        p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
      });
      const sendPart = async (partNumber: number, buf: Buffer) => {
        const md5 = `"${createHash('md5').update(buf).digest('hex')}"`;
        const have = stored.get(partNumber);
        let etag: string;
        if (have && have.size === buf.length && have.etag.replace(/"/g, '') === md5.replace(/"/g, '')) {
          etag = have.etag; // checkpoint verified against the bytes the source produced now
        } else {
          etag = (await withTimeout(this.#store.uploadPart(o!.bucket, o!.objectKey, uploadId as string, partNumber, buf))).etag;
          const hex = /^"?[0-9a-f]{32}"?$/i;
          if (hex.test(etag) && etag.replace(/"/g, '').toLowerCase() !== md5.replace(/"/g, '')) throw new StorageError('CORRUPT', `part ${partNumber} was altered in transit`, 502);
        }
        done.push({ partNumber, etag });
      };
      const launch = async (buf: Buffer) => {
        n++;
        const num = n;
        total += buf.length;
        while (inflight.size >= concurrency) await Promise.race(inflight);
        if (firstError) throw firstError;
        const p: Promise<void> = sendPart(num, buf).catch((e) => { firstError ??= e; }).finally(() => { inflight.delete(p); });
        inflight.add(p);
      };
      let acc: Buffer[] = [];
      let accLen = 0;
      for await (const chunk of await input.body()) {
        if (input.signal?.aborted) throw new StorageError('CONFLICT', 'migration cancelled', 409);
        if (firstError) break;
        let c = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        while (c.length) {
          const take = Math.min(partBytes - accLen, c.length);
          acc.push(c.subarray(0, take)); accLen += take; c = c.subarray(take);
          if (accLen === partBytes) { const buf = Buffer.concat(acc, accLen); acc = []; accLen = 0; await launch(buf); }
        }
      }
      if (accLen > 0 && !firstError) await launch(Buffer.concat(acc, accLen));
      await Promise.all(inflight);
      if (firstError) throw firstError;
      if (total !== input.size) throw new StorageError('CONFLICT', 'source stream length differs from the measured size', 409);
      const ordered = done.sort((a, b) => a.partNumber - b.partNumber);
      if (ordered.length !== parts) throw new StorageError('CONFLICT', 'unexpected number of parts', 409);
      try {
        await this.#store.completeMultipart(o.bucket, o.objectKey, uploadId as string, ordered);
      } catch (err) {
        if (!(err instanceof ProviderUnavailableError)) throw err;
        const h = await this.#store.head(o.bucket, o.objectKey).catch(() => null);
        if (!h) throw new StorageError('PROVIDER_UNAVAILABLE', 'multipart completion did not complete', 503);
      }
    }
    return { object: await this.#verifyAndAdmit(o, actor), reused: false };
  }

  /** Independent read-back of a stored object (no tenant check: internal verification for migration/reconcile tooling). */
  async verifyStoredObject(objectId: string): Promise<{ present: boolean; state: ObjectState | null; size?: number; sha256?: string }> {
    const o = await this.#repo.getObject(objectId);
    if (!o) return { present: false, state: null };
    const head = await this.#store.head(o.bucket, o.objectKey);
    if (!head) return { present: false, state: o.state };
    const { sha256, size } = await hashStream(await this.#store.openRead(o.bucket, o.objectKey));
    return { present: true, state: o.state, size, sha256 };
  }

  /** Mark an admitted object CORRUPT (e.g. a migration verification found it differs from its source). Never deletes. */
  async markCorrupt(objectId: string, code: string): Promise<void> {
    await this.#repo.updateObject(objectId, ['READY', 'VERIFYING'], { state: 'CORRUPT', errorCode: code });
  }

  // ---- read --------------------------------------------------------------------------------------

  async getDownload(actor: StorageActor, objectId: string, ttlSeconds = DOWNLOAD_URL_TTL_SECONDS) {
    const o = await this.#owned(actor, objectId);
    await this.#authorizeProject(actor, o.projectId);
    if (o.state !== 'READY') throw new StorageError('NOT_FOUND', 'object is not available', 404);
    if (o.sha256Verified === null || o.sizeBytes === null) throw new StorageError('CONFLICT', 'object is not verified', 409);
    const ttl = Math.min(Math.max(1, Math.floor(ttlSeconds)), MAX_DOWNLOAD_URL_TTL_SECONDS);
    const h = safeDownloadHeaders(o.contentType, o.safeFilename);
    const s = await this.#store.presignGet({ bucket: o.bucket, key: o.objectKey, ttlSeconds: ttl, contentType: h.contentType, contentDisposition: h.contentDisposition });
    await this.#audit(actor, o, 'download.sign', 'ok', { ttl });
    await this.#assertCapabilityCurrent(actor,o,'READY');
    return { url: s.url, expiresAt: s.expiresAt.toISOString(), filename: o.safeFilename, contentType: h.contentType, size: o.sizeBytes, sha256: o.sha256Verified };
  }

  async getObjectMeta(actor: StorageActor, objectId: string): Promise<PublicObject> {
    return toPublicObject(await this.#owned(actor, objectId));
  }

  async listObjects(actor: StorageActor, f: { projectId?: string | null; limit?: number; afterId?: string } = {}): Promise<PublicObject[]> {
    if (f.projectId) await this.#authorizeProject(actor, f.projectId);
    const rows = await this.#repo.listObjects(actor.tenantId, { projectId: f.projectId, states: ['READY'], limit: Math.min(f.limit ?? 100, 500), afterId: f.afterId });
    return rows.filter((o) => o.ownerUserId === actor.userId).map(toPublicObject);
  }

  /** Server-side read for trusted backend consumers (never exposed over HTTP). Verifies tenant + READY + integrity. */
  async readObjectBytes(actor: StorageActor, objectId: string, maxBytes = 50 * 1024 * 1024): Promise<{ bytes: Buffer; contentType: string; filename: string }> {
    const o = await this.#owned(actor, objectId);
    await this.#authorizeProject(actor, o.projectId);
    if (o.state !== 'READY' || o.sizeBytes === null || o.sha256Verified === null) throw new StorageError('NOT_FOUND', 'object is not available', 404);
    if (o.sizeBytes > maxBytes) throw new StorageError('POLICY_REJECTED', 'object too large to read into memory', 413);
    const chunks: Buffer[] = [];
    try {
      for await (const c of await this.#store.openRead(o.bucket, o.objectKey)) chunks.push(Buffer.from(c));
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw new StorageError('PROVIDER_UNAVAILABLE', 'storage temporarily unavailable; retry', 503);
      // the bytes vanished between the metadata read and the provider read (concurrent delete, or provider-side loss)
      if (/NoSuchKey|NotFound|not found/i.test(`${(err as Error)?.name} ${(err as Error)?.message}`)) throw new StorageError('NOT_FOUND', 'object is not available', 404);
      throw err;
    }
    const bytes = Buffer.concat(chunks);
    if (sha256Hex(bytes) !== o.sha256Verified) {
      await this.#repo.updateObject(o.id, ['READY'], { state: 'CORRUPT', errorCode: 'READBACK_MISMATCH' });
      throw new StorageError('CORRUPT', 'stored object failed integrity verification', 500);
    }
    return { bytes, contentType: o.contentType, filename: o.safeFilename };
  }

  // ---- delete ------------------------------------------------------------------------------------

  async deleteObject(actor: StorageActor, objectId: string): Promise<void> {
    const o = await this.#owned(actor, objectId);
    await this.#authorizeProject(actor, o.projectId);
    if (o.state === 'DELETED') return;
    if (o.retentionUntil && o.retentionUntil > this.#now()) throw new StorageError('FORBIDDEN', 'object is under retention', 403);
    const marked = await this.#repo.updateObject(o.id, ['PENDING', 'UPLOADING', 'READY', 'QUARANTINED', 'CORRUPT', 'FAILED', 'DELETING'], { state: 'DELETING', deletingAt: this.#now() });
    if (!marked) throw new StorageError('BAD_STATE', `object is ${o.state.toLowerCase()}`, 409);
    await this.#audit(actor, marked, 'delete', 'started');
    await this.#finishDeletion(marked);
  }

  /** Metadata first (DELETING), then provider, then DELETED. A crash anywhere is resumed by reconcile. */
  async #finishDeletion(o: StorageObject): Promise<boolean> {
    try {
      if (o.multipartUploadId) await this.#store.abortMultipart(o.bucket, o.objectKey, o.multipartUploadId);
      await this.#store.delete(o.bucket, o.objectKey);
    } catch {
      return false; // stays DELETING; never mark DELETED unless the provider confirmed
    }
    const done = await this.#repo.updateObject(o.id, ['DELETING'], { state: 'DELETED', deletedAt: this.#now() });
    if (done) { await this.#repo.release(o.id); await this.#repo.free(o.id); }
    return !!done;
  }

  // ---- reconciliation ----------------------------------------------------------------------------

  async reconcile(opts: { limit?: number; scanOrphans?: boolean; orphanPrefix?: string } = {}): Promise<ReconcileReport> {
    const limit = opts.limit ?? 200;
    const now = this.#now();
    const report: ReconcileReport = { expiredReservations: 0, abandonedCleaned: 0, reverified: 0, deletionsFinished: 0, missingObjects: [], orphanKeys: [], usageDrift: [], errors: [] };
    const tenants = new Set<string>();

    report.expiredReservations = await this.#repo.expireReservations(now);

    for (const o of await this.#repo.listExpiredUploads(now, limit)) {
      tenants.add(o.tenantId);
      const marked = await this.#repo.updateObject(o.id, ['PENDING', 'UPLOADING'], { state: 'DELETING', deletingAt: now, errorCode: 'ABANDONED' });
      if (marked && (await this.#finishDeletion(marked))) report.abandonedCleaned++;
      else report.errors.push({ objectId: o.id, code: 'ABANDON_CLEANUP_DEFERRED' });
    }

    for (const o of await this.#repo.listByState(['VERIFYING'], new Date(now.getTime() - VERIFY_STALE_MS), limit)) {
      tenants.add(o.tenantId);
      try { await this.#verifyAndAdmit(o, null); report.reverified++; } catch (e) {
        report.errors.push({ objectId: o.id, code: e instanceof StorageError ? e.code : 'VERIFY_ERROR' });
      }
    }

    for (const o of await this.#repo.listByState(['DELETING'], new Date(now.getTime() - 60_000), limit)) {
      tenants.add(o.tenantId);
      if (await this.#finishDeletion(o)) report.deletionsFinished++;
    }

    for (const o of await this.#repo.listByState(['READY'], now, limit)) {
      tenants.add(o.tenantId);
      const h = await this.#store.head(o.bucket, o.objectKey).catch(() => 'ERR' as const);
      if (h === 'ERR') continue; // provider hiccup: say nothing rather than guess
      if (h === null) {
        await this.#repo.updateObject(o.id, ['READY'], { state: 'CORRUPT', errorCode: 'OBJECT_MISSING' });
        report.missingObjects.push({ objectId: o.id });
      } else if (o.sizeBytes !== null && h.size !== o.sizeBytes) {
        await this.#repo.updateObject(o.id, ['READY'], { state: 'CORRUPT', errorCode: 'SIZE_DRIFT' });
        report.errors.push({ objectId: o.id, code: 'SIZE_DRIFT' });
      }
    }

    if (opts.scanOrphans) {
      let cursor: string | undefined;
      do {
        const page = await this.#store.list(this.#bucket, opts.orphanPrefix ?? 'v1/', cursor, 1000);
        for (const k of page.keys) {
          if (!(await this.#repo.findByKey(this.#store.provider, this.#bucket, k.key))) report.orphanKeys.push(k.key);
        }
        cursor = page.next;
      } while (cursor && report.orphanKeys.length < limit);
    }

    for (const t of tenants) {
      const { before, after } = await this.#repo.reconcileUsage(t);
      if (before.reservedBytes !== after.reservedBytes || before.committedBytes !== after.committedBytes) {
        report.usageDrift.push({ tenantId: t, before: { reserved: before.reservedBytes, committed: before.committedBytes }, after: { reserved: after.reservedBytes, committed: after.committedBytes } });
      }
    }
    await this.#audit(null, null, 'reconcile', 'done', { ...report, orphanKeys: report.orphanKeys.length, missingObjects: report.missingObjects.length });
    return report;
  }
}
