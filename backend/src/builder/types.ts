import type { ProjectFile } from '../ai/patches.js';

/**
 * AI Product Builder (Batch 2).
 *
 * This module composes Xroga's existing canonical machinery (tryUniversalBuild, SoftwareAgent,
 * ProjectRuntimeManager, livePreview). It adds durable project identity, an approved-starter
 * registry and source revisions. It is not an orchestrator: it never schedules work itself.
 */

export type BuilderProjectState =
  | 'created'
  | 'specified'
  | 'generating'
  | 'generated'
  | 'verifying'
  | 'verified'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'cancelled';

export type RevisionOrigin = 'starter' | 'generation' | 'repair' | 'followup' | 'restore';
export type RevisionVerification = 'unverified' | 'verified' | 'partial' | 'failed';

/** Adapted from the canonical ProductDefinitionV1 / UniversalProductSpec, not a second schema. */
export interface BuildSpec {
  readonly schemaVersion: '1.0.0';
  readonly objective: string;
  readonly title: string;
  readonly productType: string;
  readonly pages: ReadonlyArray<{ path: string; purpose: string }>;
  readonly workflows: ReadonlyArray<{ description: string; acceptanceCriteria: readonly string[] }>;
  readonly visualRequirements: {
    readonly style?: string;
    readonly responsive: boolean;
    readonly accessibilityRequired: boolean;
  };
  readonly technicalRequirements: {
    readonly framework?: string;
    readonly requiresBackend: boolean;
    readonly requiresAuthentication: boolean;
    readonly requiresDatabase: boolean;
    /** Integrations the product needs. Never silently replaced by fake behaviour. */
    readonly requiredIntegrations: readonly string[];
  };
  readonly constraints: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  /** Requirements the selected starter cannot satisfy yet. Reported, never hidden. */
  readonly unsupported: readonly string[];
}

export interface StarterProvenance {
  readonly starterId: string;
  readonly starterVersion: string;
  readonly license: string;
  /** Upstream the starter derives from, with the exact admitted revision, or null for Xroga-original. */
  readonly upstream: { readonly repository: string; readonly revision: string } | null;
  /** SHA-256 over the materialised seed tree. Proves which bytes seeded the project. */
  readonly seedSha256: string;
  readonly selectionReason: string;
}

export interface BuilderProject {
  readonly id: string;
  readonly userId: string;
  readonly requestKey: string;
  readonly title: string;
  readonly productType: string;
  readonly state: BuilderProjectState;
  readonly stateReason: string;
  readonly spec: BuildSpec;
  readonly starter: StarterProvenance;
  readonly conversationId: string | null;
  readonly activeRunId: string | null;
  readonly currentRevisionId: string | null;
  readonly currentRevisionNumber: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BuilderRevision {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly revisionNumber: number;
  readonly parentRevisionId: string | null;
  readonly runId: string;
  readonly origin: RevisionOrigin;
  readonly contentSha256: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly files: readonly ProjectFile[];
  readonly changeSummary: ChangeSummary;
  readonly verificationStatus: RevisionVerification;
  readonly createdAt: string;
}

export interface ChangeSummary {
  readonly created: readonly string[];
  readonly modified: readonly string[];
  readonly deleted: readonly string[];
}

/** Seven states the product requires; mapped from the existing livePreview/runtime statuses. */
export type PreviewLifecycle =
  | 'not_started'
  | 'starting'
  | 'ready'
  | 'degraded'
  | 'stopped'
  | 'expired'
  | 'failed';

export class BuilderError extends Error {
  constructor(
    readonly code:
      | 'invalid_input'
      | 'not_found'
      | 'conflict'
      | 'unsupported'
      | 'storage_failed'
      | 'too_large'
      | 'budget_exhausted',
    message: string,
  ) {
    super(message);
    this.name = 'BuilderError';
  }
}

export const MAX_SNAPSHOT_FILES = 2_000;
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

export type VerificationKind = 'browser_qa' | 'export';
export type VerificationStatus = 'passed' | 'failed' | 'partial' | 'pending_runtime';

export interface VerificationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly revisionId: string;
  readonly runId: string;
  readonly kind: VerificationKind;
  readonly status: VerificationStatus;
  readonly executedChecks: number;
  readonly summary: Record<string, unknown>;
  /** Full report. Omitted from list results. */
  readonly report?: unknown;
  readonly createdAt: string;
}

export type ExternalOperationStatus = 'prepared' | 'approved' | 'executing' | 'succeeded' | 'failed' | 'ambiguous' | 'diverged' | 'cancelled';

export interface ExternalOperation {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly provider: 'github';
  readonly action: 'create_repository' | 'push_revision';
  readonly operationKey: string;
  readonly revisionId: string;
  readonly status: ExternalOperationStatus;
  readonly plan: Record<string, unknown>;
  readonly planDigest: string;
  readonly approvedAt: string | null;
  readonly approvalExpiresAt: string | null;
  readonly receipt: Record<string, unknown> | null;
  readonly failure: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
