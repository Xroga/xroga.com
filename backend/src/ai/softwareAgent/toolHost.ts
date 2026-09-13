import type {
  SoftwareCheckResult,
  SoftwareExecutionContract,
  SoftwarePreviewEvidence,
} from './contracts.js';

export interface ProjectFileSummary {
  path: string;
  size?: number;
  language?: string;
}

export interface ProjectFileContent {
  path: string;
  content: string;
}

export interface CommandExecutionResult {
  commandId: string;

  command: string;
  cwd?: string;

  exitCode: number;

  stdout: string;
  stderr: string;

  durationMs: number;
}

export interface FileMutationResult {
  path: string;

  revision?: string;

  created: boolean;

  additions?: number;
  deletions?: number;
}

export interface GitDiffResult {
  changedPaths: string[];

  diff: string;

  additions?: number;
  deletions?: number;
}

export interface ReviewBranchResult {
  branch: string;
  commitSha: string;

  changedPaths: string[];
}

export interface SoftwareAgentToolHost {
  /**
   * List files from the authorized project/workspace.
   *
   * The implementation must never expose files outside the
   * authorized project root.
   */
  listFiles(
    contract: SoftwareExecutionContract,
  ): Promise<ProjectFileSummary[]>;

  /**
   * Read only explicitly requested project files.
   */
  readFiles(
    contract: SoftwareExecutionContract,
    paths: string[],
  ): Promise<ProjectFileContent[]>;

  /**
   * Search inside the authorized project.
   */
  searchProject(
    contract: SoftwareExecutionContract,
    query: string,
  ): Promise<
    Array<{
      path: string;
      line?: number;
      preview?: string;
    }>
  >;

  /**
   * Create or replace one project file.
   *
   * IMPORTANT:
   * The host implementation must independently enforce
   * repository-root and write-policy rules.
   *
   * Never trust the model merely because the tool wrapper
   * already checked a path.
   */
  writeFile(
    contract: SoftwareExecutionContract,
    path: string,
    content: string,
  ): Promise<FileMutationResult>;

  /**
   * Delete one file when the contract explicitly permits it.
   */
  deleteFile(
    contract: SoftwareExecutionContract,
    path: string,
  ): Promise<{
    path: string;
    deleted: boolean;
  }>;

  /**
   * Execute a command only inside the isolated Xroga
   * execution environment.
   *
   * NEVER execute generated project commands directly on the
   * Xroga API/control-plane host.
   */
  runCommand(
    contract: SoftwareExecutionContract,
    command: string,
  ): Promise<CommandExecutionResult>;

  /**
   * Let Xroga deterministically select applicable checks from
   * the actual project/runtime.
   */
  runChecks(
    contract: SoftwareExecutionContract,
  ): Promise<SoftwareCheckResult[]>;

  /**
   * Return the authoritative workspace diff.
   */
  gitDiff(
    contract: SoftwareExecutionContract,
  ): Promise<GitDiffResult>;

  /**
   * Start a sandbox Preview when applicable.
   */
  startPreview(
    contract: SoftwareExecutionContract,
  ): Promise<SoftwarePreviewEvidence>;

  /**
   * Re-query the current Preview health instead of trusting a
   * stale result.
   */
  probePreview(
    contract: SoftwareExecutionContract,
    previewId: string,
  ): Promise<SoftwarePreviewEvidence>;

  /**
   * Browser-level verification.
   */
  verifyPreview(
    contract: SoftwareExecutionContract,
    previewId: string,
  ): Promise<SoftwarePreviewEvidence>;

  /**
   * Persist to an authorized review branch.
   *
   * No merge.
   * No production deployment.
   */
  createReviewBranch(
    contract: SoftwareExecutionContract,
  ): Promise<ReviewBranchResult>;
}
