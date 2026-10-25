/** Canonical Xroga Drive types. One object registry: `storage_objects`. */

export const OBJECT_STATES = [
  'PENDING', 'UPLOADING', 'VERIFYING', 'READY', 'FAILED', 'QUARANTINED', 'CORRUPT', 'DELETING', 'DELETED',
] as const;
export type ObjectState = (typeof OBJECT_STATES)[number];

export const OBJECT_CLASSES = [
  'upload', 'artifact', 'media', 'evidence', 'source_archive', 'screenshot', 'export',
] as const;
export type ObjectClass = (typeof OBJECT_CLASSES)[number];

/** Mirrors the transition trigger in the SQL migration. The service checks first; the database enforces. */
const ALLOWED: ReadonlyArray<readonly [ObjectState, ObjectState]> = [
  ['PENDING', 'UPLOADING'], ['PENDING', 'VERIFYING'], ['PENDING', 'FAILED'], ['PENDING', 'DELETING'],
  ['UPLOADING', 'VERIFYING'], ['UPLOADING', 'FAILED'], ['UPLOADING', 'DELETING'],
  ['VERIFYING', 'READY'], ['VERIFYING', 'CORRUPT'], ['VERIFYING', 'QUARANTINED'], ['VERIFYING', 'FAILED'],
  ['READY', 'DELETING'], ['READY', 'QUARANTINED'], ['READY', 'CORRUPT'],
  ['QUARANTINED', 'VERIFYING'], ['QUARANTINED', 'DELETING'],
  ['CORRUPT', 'VERIFYING'], ['CORRUPT', 'DELETING'],
  ['FAILED', 'DELETING'],
  ['DELETING', 'DELETED'],
];

export function canTransition(from: ObjectState, to: ObjectState): boolean {
  return from === to || ALLOWED.some(([a, b]) => a === from && b === to);
}

export interface StorageObject {
  id: string;
  tenantId: string;
  ownerUserId: string;
  projectId: string | null;
  objectClass: ObjectClass;
  originalFilename: string;
  safeFilename: string;
  provider: 'r2' | 'memory';
  bucket: string;
  objectKey: string;
  contentType: string;
  declaredSize: number;
  sizeBytes: number | null;
  sha256Declared: string | null;
  sha256Verified: string | null;
  state: ObjectState;
  visibility: 'private' | 'public';
  uploadMode: 'single' | 'multipart';
  multipartUploadId: string | null;
  uploadExpiresAt: Date | null;
  retentionUntil: Date | null;
  providerVersion: string | null;
  migrationJobId: string | null;
  legacySource: Record<string, unknown> | null;
  verifiedAt: Date | null;
  verificationResult: Record<string, unknown> | null;
  errorCode: string | null;
  errorDetail: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Identity comes only from the authenticated backend context, never from the request body.
 * `tenantId` currently equals the user id; it is the seam where Batch 1 TenantContext plugs in
 * (WAITING_FOR_BATCH1_ACCEPTED_INTERFACE).
 */
export interface StorageActor {
  userId: string;
  tenantId: string;
}

export type StorageErrorCode =
  | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_REQUEST' | 'POLICY_REJECTED' | 'QUOTA_EXCEEDED'
  | 'BAD_STATE' | 'UPLOAD_MISSING' | 'SIZE_MISMATCH' | 'CHECKSUM_MISMATCH' | 'EXPIRED' | 'PROVIDER_UNAVAILABLE'
  | 'CORRUPT' | 'QUARANTINED' | 'CONFLICT';

export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode, message: string, readonly status = 400) {
    super(message);
    this.name = 'StorageError';
  }
}

export function httpStatusFor(code: StorageErrorCode): number {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'FORBIDDEN': return 403;
    case 'QUOTA_EXCEEDED': return 413;
    case 'BAD_STATE': case 'CONFLICT': return 409;
    case 'EXPIRED': return 410;
    case 'PROVIDER_UNAVAILABLE': return 503;
    case 'POLICY_REJECTED': return 415;
    default: return 400;
  }
}
