import type { ObjectClass } from '../types.js';

export const PHASES = ['DISCOVER', 'DRY_RUN', 'COPY', 'VERIFY', 'RECONCILE', 'READ_NEW', 'OBSERVE', 'FREEZE_OLD', 'RETAIN', 'APPROVED_DELETE'] as const;
export type Phase = (typeof PHASES)[number];

export type ItemStatus =
  | 'DISCOVERED' | 'ELIGIBLE' | 'SKIPPED' | 'BLOCKED' | 'COPYING' | 'COPIED' | 'VERIFIED'
  | 'FAILED' | 'MISSING_SOURCE' | 'SOURCE_CHANGED' | 'CORRUPT_DESTINATION';

export type SourceProvider = 'legacy_r2' | 'supabase_storage' | 'project_files_inline' | 'local_media_cache' | 'run_output_artifacts';
export type Stage = 'copy' | 'read_new' | 'freeze_old' | 'delete';

export interface Job {
  id: string;
  name: string;
  sourceProvider: SourceProvider;
  sourceSelector: Record<string, unknown>;
  destinationBucket: string;
  mode: 'dry_run' | 'copy';
  phase: Phase;
  status: 'CREATED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  cursor: Record<string, unknown>;
  /** stage -> signed approval token (see approvals.ts). Presence alone authorises nothing: the engine verifies the signature. */
  approvals: Partial<Record<Stage, string>>;
  /** digest of the exact object set the last dry-run planned; cleared whenever discovery adds or changes objects */
  plan: { digest: string; count: number; bytes: number; at: string } | null;
  createdBy: string;
}

export interface Item {
  id: string;
  jobId: string;
  sourceProvider: SourceProvider;
  sourceId: string;
  tenantId: string | null;
  ownerUserId: string | null;
  projectId: string | null;
  sourceSize: number | null;
  sourceSha256: string | null;
  sourceFingerprint: string | null;
  sourceContentType: string | null;
  sourceFilename: string | null;
  objectClass: ObjectClass | null;
  destinationObjectId: string | null;
  destinationKey: string | null;
  destinationSha256: string | null;
  status: ItemStatus;
  skipReason: string | null;
  attempts: number;
  lastErrorClass: string | null;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  readMode: 'legacy' | 'new';
  sourceRetention: 'RETAINED' | 'FROZEN' | 'DELETE_APPROVED' | 'DELETED';
  rollbackRef: Record<string, unknown> | null;
  startedAt: Date | null;
  completedAt: Date | null;
  verifiedAt: Date | null;
}

export interface DiscoveredItem {
  sourceId: string;
  size: number | null;
  fingerprint: string;
  contentType: string | null;
  filename: string;
  ownerUserId: string | null;
  projectId: string | null;
  objectClass: ObjectClass;
  /** set by adapters for storage that is a cache, not a record of customer data */
  ephemeral?: boolean;
  /** adapter-detected reason this object must not enter the ordinary pipeline */
  blockedReason?: string;
}

export interface OpenedSource {
  body: () => Promise<AsyncIterable<Uint8Array>>;
  size: number;
  fingerprint: string;
  contentType: string | null;
}

export interface SourceAdapter {
  readonly provider: SourceProvider;
  /** Read-only enumeration; resumable through an opaque cursor. */
  discover(cursor: string | undefined, limit: number): Promise<{ items: DiscoveredItem[]; next?: string }>;
  /** Null when the source object no longer exists. */
  open(sourceId: string): Promise<OpenedSource | null>;
}

export class NotApprovedError extends Error {
  constructor(readonly stage: Stage | 'delete-not-implemented', readonly reason = 'NO_APPROVAL') {
    super(stage === 'delete-not-implemented'
      ? 'legacy deletion is not implemented in Phase 1: retirement is a separately approved cutover'
      : `stage "${stage}" is not approved for this job (${reason})`);
    this.name = 'NotApprovedError';
  }
}

export interface Reconciliation {
  jobId: string;
  discovered: number;
  eligible: number;
  copied: number;
  sha256Verified: number;
  skipped: Array<{ reason: string; count: number }>;
  missingSources: number;
  failed: number;
  pending: number;
  corruptDestinations: number;
  sourceChanged: number;
  blocked: Array<{ reason: string; count: number }>;
  retainedForRollback: number;
  notYetApproved: number;
  readingFromNew: number;
  /** VERIFIED in the ledger but the destination object is missing, not READY, or hashes differently */
  metadataMismatches: number;
  bytes: { discovered: number; verified: number };
  /** discovered must equal the sum of every disjoint bucket; a mismatch is reported, never smoothed over */
  consistent: boolean;
}
