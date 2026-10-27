/** Durable records for a change to an existing project: what was asked, what scope it was given, every revision with its evidence, and where it ended. */
import type { ChangedFile } from './workspace.js';

export type ChangeStatus =
  | 'queued' | 'planning' | 'working' | 'verifying' | 'repairing'
  | 'verified'      // changes exist and the project's own tests passed in isolation
  | 'unverified'    // changes exist but tests could not be run or no runner exists (never reads as a pass)
  | 'failed'        // no acceptable change, or tests still failing after the bounded repair attempts
  | 'cancelled' | 'interrupted' | 'delivered';

export const TERMINAL: readonly ChangeStatus[] = ['verified', 'unverified', 'failed', 'cancelled', 'delivered'];

export interface ChangeEvent { readonly at: string; readonly type: string; readonly message: string; readonly data?: Readonly<Record<string, string | number | boolean | null>> }

export interface TestEvidence {
  readonly status: string;
  readonly summary: string;
  readonly runtime: string | null;
  readonly stages: readonly { readonly label: string; readonly kind: string; readonly exitCode: number | null; readonly timedOut: boolean; readonly durationMs: number }[];
  /** Bounded, redacted. */
  readonly evidence: string;
}

export interface ChangeRevision {
  readonly n: number;
  readonly at: string;
  readonly digest: string;
  readonly baseCommitSha: string;
  readonly files: readonly ChangedFile[];
  readonly additions: number;
  readonly deletions: number;
  readonly warnings: readonly string[];
  /** Unified diff, bounded. `diffTruncated` says when the stored diff is a prefix. */
  readonly diff: string;
  readonly diffTruncated: boolean;
  readonly tests: TestEvidence | null;
  readonly note: string;
}

export interface ChangeScope {
  readonly confidence: 'high' | 'medium' | 'low';
  readonly targets: readonly string[];
  readonly consumers: readonly string[];
  readonly tests: readonly string[];
  readonly allowedDirs: readonly string[];
  readonly mapStatus: string;
}

export interface ResultFile { readonly path: string; readonly kind: 'created' | 'modified' | 'deleted'; readonly content: string | null }

export interface DeliveryReceipt {
  readonly kind: 'pull_request' | 'branch' | 'patch_export' | 'zip_export';
  readonly at: string;
  readonly branch: string | null;
  readonly commitSha: string | null;
  readonly pullRequestNumber: number | null;
  readonly pullRequestUrl: string | null;
  readonly baseBranch: string | null;
  readonly baseCommitSha: string;
  readonly headAtDelivery: string | null;
  readonly rebased: boolean;
  readonly verified: boolean;
  readonly draft: boolean;
  readonly digest: string;
  readonly note: string;
}

export interface ChangeTask {
  readonly id: string;
  readonly ownerUserId: string;
  readonly bindingId: string;
  readonly instruction: string;
  readonly status: ChangeStatus;
  readonly statusReason: string;
  readonly baseCommitSha: string;
  readonly scope: ChangeScope | null;
  readonly acceptanceCriteria: readonly string[];
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly revisions: readonly ChangeRevision[];
  readonly events: readonly ChangeEvent[];
  /** The resulting content of every changed file, so the change survives a restart and can be exported or delivered. */
  readonly result: readonly ResultFile[];
  readonly reproduction: 'reproduced' | 'not_reproduced' | 'not_applicable' | 'unavailable';
  readonly regressionTestAdded: boolean;
  readonly deliveries: readonly DeliveryReceipt[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const MAX_EVENTS = 300;
export const MAX_REVISIONS = 10;
export const MAX_STORED_DIFF = 120_000;
export const MAX_RESULT_BYTES = 4 * 1024 * 1024;
