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

  /**
   * Repository persistence authority is deliberately separate
   * from deployment authority.
   *
   * none:
   *   The run may modify only its isolated workspace.
   *
   * review_branch:
   *   Verified work may be persisted to an authorized review
   *   branch. This never grants merge or deployment authority.
   */
  persistence: RepositoryPersistenceAuthority;

  /**
   * Deployment authority is independent from repository writes.
   *
   * A review-branch authorization must never be interpreted as
   * permission to deploy.
   */
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

export interface SoftwarePreviewEvidence {
  previewId: string;
  url: string;

  runtime?: string;
  port?: number;

  httpStatus?: number;

  consoleErrors: string[];
  runtimeErrors: string[];

  desktopVerified?: boolean;
  tabletVerified?: boolean;
  mobileVerified?: boolean;
}

export interface SoftwareRunEvidence {
  changedFiles: SoftwareFileRevision[];

  checks: SoftwareCheckResult[];

  preview?: SoftwarePreviewEvidence;

  commitSha?: string;
  branch?: string;
}
