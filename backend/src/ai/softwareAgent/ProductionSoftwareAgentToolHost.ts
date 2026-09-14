import type {
  SoftwareCheckResult,
  SoftwareExecutionContract,
  SoftwarePreviewEvidence,
} from './contracts.js';

import {
  evaluateWritePolicy,
} from './writePolicy.js';

import type {
  CommandExecutionResult,
  FileMutationResult,
  FileWriteIntent,
  GitDiffResult,
  ProjectFileContent,
  ProjectFileSummary,
  ReviewBranchResult,
  SoftwareAgentToolHost,
} from './toolHost.js';

export interface ProductionSoftwareAgentOperations {
  listFiles(
    contract: SoftwareExecutionContract,
  ): Promise<ProjectFileSummary[]>;

  readFiles(
    contract: SoftwareExecutionContract,
    paths: string[],
  ): Promise<ProjectFileContent[]>;

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

  writeFile(
    contract: SoftwareExecutionContract,
    path: string,
    content: string,
    intent: FileWriteIntent,
  ): Promise<FileMutationResult>;

  deleteFile(
    contract: SoftwareExecutionContract,
    path: string,
  ): Promise<{
    path: string;
    deleted: boolean;
  }>;

  runCommand(
    contract: SoftwareExecutionContract,
    command: string,
  ): Promise<CommandExecutionResult>;

  runChecks(
    contract: SoftwareExecutionContract,
  ): Promise<SoftwareCheckResult[]>;

  gitDiff(
    contract: SoftwareExecutionContract,
  ): Promise<GitDiffResult>;

  startPreview(
    contract: SoftwareExecutionContract,
  ): Promise<SoftwarePreviewEvidence>;

  probePreview(
    contract: SoftwareExecutionContract,
    previewId: string,
  ): Promise<SoftwarePreviewEvidence>;

  verifyPreview(
    contract: SoftwareExecutionContract,
    previewId: string,
  ): Promise<SoftwarePreviewEvidence>;

  createReviewBranch(
    contract: SoftwareExecutionContract,
  ): Promise<ReviewBranchResult>;
}

function normalizeProjectPath(
  input: string,
): string {
  const value = input
    .trim()
    .replace(/\\/g, '/');

  if (!value) {
    throw new Error(
      'Project path is required.',
    );
  }

  if (value.startsWith('/')) {
    throw new Error(
      'Absolute project paths are not allowed.',
    );
  }

  const parts = value.split('/');

  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..',
    )
  ) {
    throw new Error(
      `Invalid project path: ${input}`,
    );
  }

  return parts.join('/');
}

function uniquePaths(
  paths: string[],
): string[] {
  return [
    ...new Set(
      paths.map(normalizeProjectPath),
    ),
  ];
}

function requireMutationAllowed(
  contract: SoftwareExecutionContract,
  operation: FileWriteIntent | 'delete',
  path: string,
): void {
  const decision = evaluateWritePolicy(
    contract.writePolicy,
    operation,
    path,
  );

  if (decision.allowed) {
    return;
  }

  throw new Error(
    `${decision.code ?? 'WRITE_POLICY_DENIED'}: ${
      decision.message ??
      `Mutation of ${path} is outside the authorized task scope.`
    }`,
  );
}

/**
 * Production boundary between the software agent and Xroga.
 *
 * The agent never receives direct access to:
 *
 * - GitHub credentials
 * - Fly credentials
 * - Supabase secrets
 * - the Xroga API host shell
 * - production deployment credentials
 *
 * It can only invoke operations exposed through this host.
 *
 * Real implementations are injected through
 * ProductionSoftwareAgentOperations so Xroga can reuse its
 * existing sandbox, repository, validation, Preview and GitHub
 * systems instead of creating another infrastructure stack.
 */
export class ProductionSoftwareAgentToolHost
  implements SoftwareAgentToolHost
{
  constructor(
    private readonly operations:
      ProductionSoftwareAgentOperations,
  ) {}

  async listFiles(
    contract: SoftwareExecutionContract,
  ): Promise<ProjectFileSummary[]> {
    const files =
      await this.operations.listFiles(
        contract,
      );

    return files.map((file) => ({
      ...file,
      path: normalizeProjectPath(
        file.path,
      ),
    }));
  }

  async readFiles(
    contract: SoftwareExecutionContract,
    paths: string[],
  ): Promise<ProjectFileContent[]> {
    const normalizedPaths =
      uniquePaths(paths);

    if (normalizedPaths.length === 0) {
      return [];
    }

    const files =
      await this.operations.readFiles(
        contract,
        normalizedPaths,
      );

    return files.map((file) => ({
      ...file,
      path: normalizeProjectPath(
        file.path,
      ),
    }));
  }

  async searchProject(
    contract: SoftwareExecutionContract,
    query: string,
  ): Promise<
    Array<{
      path: string;
      line?: number;
      preview?: string;
    }>
  > {
    const cleanedQuery =
      query.trim();

    if (!cleanedQuery) {
      return [];
    }

    const results =
      await this.operations.searchProject(
        contract,
        cleanedQuery,
      );

    return results.map((result) => ({
      ...result,
      path: normalizeProjectPath(
        result.path,
      ),
    }));
  }

  async writeFile(
    contract: SoftwareExecutionContract,
    path: string,
    content: string,
    intent: FileWriteIntent,
  ): Promise<FileMutationResult> {
    const normalizedPath =
      normalizeProjectPath(path);

    /*
     * Defense in depth:
     *
     * The Cline tool wrapper checks the write policy before
     * calling this host, but the production host is itself a
     * security boundary and must never trust the model/tool
     * layer to have performed authorization correctly.
     */
    requireMutationAllowed(
      contract,
      intent,
      normalizedPath,
    );

    /*
     * Independently verify whether the requested create /
     * modify operation matches the real current workspace.
     *
     * Model-declared intent is never trusted by itself.
     */
    const files =
      await this.operations.listFiles(
        contract,
      );

    const existingPaths = new Set(
      files.map((file) =>
        normalizeProjectPath(file.path),
      ),
    );

    const exists =
      existingPaths.has(normalizedPath);

    if (
      intent === 'create' &&
      exists
    ) {
      throw new Error(
        `CREATE_CONFLICT: ${normalizedPath} already exists.`,
      );
    }

    if (
      intent === 'modify' &&
      !exists
    ) {
      throw new Error(
        `MODIFY_TARGET_MISSING: ${normalizedPath} does not exist.`,
      );
    }

    return this.operations.writeFile(
      contract,
      normalizedPath,
      content,
      intent,
    );
  }

  async deleteFile(
    contract: SoftwareExecutionContract,
    path: string,
  ): Promise<{
    path: string;
    deleted: boolean;
  }> {
    const normalizedPath =
      normalizeProjectPath(path);

    /*
     * Deletion receives the same independent host-side policy
     * enforcement as create/modify. allowedPaths therefore
     * remains a runtime boundary even if a future caller skips
     * the Cline tool wrapper entirely.
     */
    requireMutationAllowed(
      contract,
      'delete',
      normalizedPath,
    );

    const result =
      await this.operations.deleteFile(
        contract,
        normalizedPath,
      );

    return {
      ...result,
      path: normalizeProjectPath(
        result.path,
      ),
    };
  }

  async runCommand(
    contract: SoftwareExecutionContract,
    command: string,
  ): Promise<CommandExecutionResult> {
    const cleanedCommand =
      command.trim();

    if (!cleanedCommand) {
      throw new Error(
        'Command is required.',
      );
    }

    /*
     * IMPORTANT:
     *
     * ProductionSoftwareAgentOperations.runCommand must execute
     * only inside Xroga's isolated sandbox.
     *
     * Never implement this using child_process on xroga-api.
     */
    return this.operations.runCommand(
      contract,
      cleanedCommand,
    );
  }

  async runChecks(
    contract: SoftwareExecutionContract,
  ): Promise<SoftwareCheckResult[]> {
    /*
     * Xroga selects applicable checks from the actual project.
     *
     * The model does not decide that a test/build passed.
     */
    return this.operations.runChecks(
      contract,
    );
  }

  async gitDiff(
    contract: SoftwareExecutionContract,
  ): Promise<GitDiffResult> {
    return this.operations.gitDiff(
      contract,
    );
  }

  async startPreview(
    contract: SoftwareExecutionContract,
  ): Promise<SoftwarePreviewEvidence> {
    if (
      contract.preview ===
      'not_applicable'
    ) {
      throw new Error(
        'PREVIEW_NOT_APPLICABLE',
      );
    }

    return this.operations.startPreview(
      contract,
    );
  }

  async probePreview(
    contract: SoftwareExecutionContract,
    previewId: string,
  ): Promise<SoftwarePreviewEvidence> {
    const id = previewId.trim();

    if (!id) {
      throw new Error(
        'Preview id is required.',
      );
    }

    return this.operations.probePreview(
      contract,
      id,
    );
  }

  async verifyPreview(
    contract: SoftwareExecutionContract,
    previewId: string,
  ): Promise<SoftwarePreviewEvidence> {
    const id = previewId.trim();

    if (!id) {
      throw new Error(
        'Preview id is required.',
      );
    }

    return this.operations.verifyPreview(
      contract,
      id,
    );
  }

  async createReviewBranch(
    contract: SoftwareExecutionContract,
  ): Promise<ReviewBranchResult> {
    if (
      contract.persistence !==
      'review_branch'
    ) {
      throw new Error(
        'REPOSITORY_PERSISTENCE_NOT_AUTHORIZED',
      );
    }

    if (!contract.repository) {
      throw new Error(
        'NO_AUTHORIZED_REPOSITORY',
      );
    }

    /*
     * Verification is already enforced by the
     * create_review_branch tool before reaching this host.
     *
     * The underlying GitHub implementation must still enforce:
     *
     * - exact repository
     * - exact branch/base SHA
     * - atomic write
     * - no automatic merge
     * - no deployment
     */
    return this.operations.createReviewBranch(
      contract,
    );
  }
}

export function createProductionSoftwareAgentToolHost(
  operations: ProductionSoftwareAgentOperations,
): SoftwareAgentToolHost {
  return new ProductionSoftwareAgentToolHost(
    operations,
  );
}
