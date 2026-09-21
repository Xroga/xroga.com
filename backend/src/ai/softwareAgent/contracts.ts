export type SoftwareTaskKind =
  | 'new_project'
  | 'existing_repo_change'
  | 'bug_fix'
  | 'web_app'
  | 'api'
  | 'cli'
  | 'library'
  | 'documentation'
  | 'unknown_software';

export type PreviewRequirement =
  | 'required'
  | 'optional'
  | 'not_applicable';

export type VerificationAuthority =
  | 'agent'
  | 'universal';

export type RepositoryPersistenceAuthority =
  | 'none'
  | 'review_branch';

export type DeploymentAuthority =
  | 'forbidden'
  | 'prepare_only'
  | 'allowed';

export interface SoftwareRepositoryRef {
  owner: string;
  repo: string;
  branch: string;
  sourceCommit?: string;
}

export interface SoftwareWritePolicy {
  /**
   * Empty means there is no path-specific allowlist,
   * but all normal repository/security boundaries still apply.
   */
  allowedPaths: string[];

  /**
   * Paths which may be read but must never be mutated.
   */
  deniedPaths: string[];

  allowCreate: boolean;
  allowDelete: boolean;
  allowRename: boolean;
}

export interface SoftwareAcceptanceCriterion {
  id: string;
  description: string;
  required: boolean;
}

export interface SoftwareExecutionContract {
  runId: string;
  projectId?: string;

  taskKind: SoftwareTaskKind;

  goal: string;

  repository?: SoftwareRepositoryRef;

  writePolicy: SoftwareWritePolicy;

  preview: PreviewRequirement;

  verificationAuthority:
  VerificationAuthority;

  /**
   * Repository persistence is separate from deployment.
   *
   * none
   *   The run may modify only its isolated workspace.
   *
   * review_branch
   *   Xroga may persist verified changes to an authorized
   *   review branch. This never grants merge or deploy rights.
   */
  persistence: RepositoryPersistenceAuthority;

  deployment: DeploymentAuthority;

  acceptanceCriteria: SoftwareAcceptanceCriterion[];

  /**
   * User-facing constraints that must survive model/tool calls.
   *
   * Examples:
   * - "Preserve every other file."
   * - "Do not deploy."
   * - "Use existing package manager."
   */
  constraints: string[];
}

export interface SoftwareFileRevision {
  path: string;
  revision?: string;
  additions?: number;
  deletions?: number;
  created?: boolean;
  deleted?: boolean;
}

export interface SoftwareCheckResult {
  id: string;
  name: string;

  status:
    | 'pending'
    | 'running'
    | 'passed'
    | 'failed'
    | 'skipped';

  command?: string;
  exitCode?: number;
  durationMs?: number;

  summary?: string;
}

export type SoftwarePreviewVerificationStatus =
  | 'passed'
  | 'failed'
  | 'not_checked';

export type SoftwarePreviewNotCheckedReason =
  | 'not_a_web_project'
  | 'no_start_command'
  | 'sandbox_unavailable'
  | 'browser_unavailable'
  | 'application_did_not_start'
  | 'cancelled';

/**
 * Evidence from ONE isolated browser-verification execution.
 *
 * Xroga does not expose a persistent preview process to Agent V2.
 * The production verifier materializes the current workspace,
 * starts the application and browser inside one disposable sandbox,
 * gathers deterministic evidence, and tears that sandbox down.
 */
export interface SoftwarePreviewEvidence {
  status: SoftwarePreviewVerificationStatus;

  /**
   * True only when the browser/runtime verifier actually ran.
   * A not_checked result is never equivalent to a pass.
   */
  attempted: boolean;

  /**
   * Local URL observed inside the isolated sandbox when available.
   */
  url: string | null;

  notCheckedReason?:
    | SoftwarePreviewNotCheckedReason
    | null;

  /**
   * Human-readable reason verification cannot be considered passed.
   */
  blocker?:
    | string
    | null;

  /**
   * Bounded deterministic failure evidence suitable for repair.
   */
  evidenceForRepair?: string;

  /**
   * Acceptance criteria the current deterministic verifier could
   * not execute. They are evidence gaps, never silent passes.
   */
  criteriaNotChecked: string[];

  /**
   * Evidence paths only. Screenshot blobs do not belong here.
   */
  screenshots: string[];

  /**
   * Furthest deterministic verification stage reached, when known.
   */
  rungReached?: string;
}

export interface SoftwareRunEvidence {
  changedFiles: SoftwareFileRevision[];

  checks: SoftwareCheckResult[];

  preview?: SoftwarePreviewEvidence;

  commitSha?: string;
  branch?: string;
}
