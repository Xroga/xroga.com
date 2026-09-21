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

export type FileWriteIntent =
  | 'create'
  | 'modify';

export interface FileMutationResult {
  path: string;

  revision?: string;

  created: boolean;

  additions?: number;
  deletions?: number;
}

export interface FileRenameResult {
  fromPath:
    string;

  toPath:
    string;

  renamed:
    boolean;

  revision?:
    string;
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
   * Create or modify one project file.
   *
   * The caller must declare whether the requested operation
   * is a create or modify operation.
   *
   * The host must independently verify that intent against
   * the real current workspace state.
   */
  writeFile(
    contract: SoftwareExecutionContract,
    path: string,
    content: string,
    intent: FileWriteIntent,
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
 * Rename one project file when the contract explicitly permits it.
 */
renameFile(
  contract:
    SoftwareExecutionContract,

  fromPath:
    string,

  toPath:
    string,
): Promise<FileRenameResult>;
  
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
   * Run one isolated browser/runtime verification against the
   * CURRENT workspace snapshot.
   *
   * There is intentionally no start/probe lifecycle here:
   * Xroga's production browser verifier starts the app and the
   * browser inside one disposable sandbox execution.
   */
  verifyPreview(
    contract: SoftwareExecutionContract,
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
