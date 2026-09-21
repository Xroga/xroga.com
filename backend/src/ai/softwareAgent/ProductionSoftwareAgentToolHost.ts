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
  FileRenameResult,
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

  renameFile(
  contract:
    SoftwareExecutionContract,

  fromPath:
    string,

  toPath:
    string,
): Promise<FileRenameResult>;

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

  verifyPreview(
    contract: SoftwareExecutionContract,
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
      paths.map(
        normalizeProjectPath,
      ),
    ),
  ];
}

function requireMutationAllowed(
  contract: SoftwareExecutionContract,
 operation:
  | FileWriteIntent
  | 'delete'
  | 'rename',
  path: string,
): void {
  const decision =
    evaluateWritePolicy(
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

      path:
        normalizeProjectPath(
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

    if (
      normalizedPaths.length ===
      0
    ) {
      return [];
    }

    const files =
      await this.operations.readFiles(
        contract,
        normalizedPaths,
      );

    return files.map((file) => ({
      ...file,

      path:
        normalizeProjectPath(
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

    return results.map(
      (result) => ({
        ...result,

        path:
          normalizeProjectPath(
            result.path,
          ),
      }),
    );
  }

  async writeFile(
    contract: SoftwareExecutionContract,
    path: string,
    content: string,
    intent: FileWriteIntent,
  ): Promise<FileMutationResult> {
    const normalizedPath =
      normalizeProjectPath(
        path,
      );

    requireMutationAllowed(
      contract,
      intent,
      normalizedPath,
    );

    const files =
      await this.operations.listFiles(
        contract,
      );

    const existingPaths =
      new Set(
        files.map(
          (file) =>
            normalizeProjectPath(
              file.path,
            ),
        ),
      );

    const exists =
      existingPaths.has(
        normalizedPath,
      );

    if (
      intent ===
        'create' &&
      exists
    ) {
      throw new Error(
        `CREATE_CONFLICT: ${normalizedPath} already exists.`,
      );
    }

    if (
      intent ===
        'modify' &&
      !exists
    ) {
      throw new Error(
        `MODIFY_TARGET_MISSING: ${normalizedPath} does not exist.`,
      );
    }

    return this.operations
      .writeFile(
        contract,
        normalizedPath,
        content,
        intent,
      );
  }

async deleteFile(
  contract:
    SoftwareExecutionContract,

  path:
    string,
): Promise<{
  path:
    string;

  deleted:
    boolean;
}> {
  const normalizedPath =
    normalizeProjectPath(
      path,
    );

  requireMutationAllowed(
    contract,
    'delete',
    normalizedPath,
  );

  const result =
    await this.operations
      .deleteFile(
        contract,
        normalizedPath,
      );

  return {
    ...result,

    path:
      normalizeProjectPath(
        result.path,
      ),
  };
}

async renameFile(
  contract:
    SoftwareExecutionContract,

  fromPath:
    string,

  toPath:
    string,
): Promise<FileRenameResult> {
  const normalizedFrom =
    normalizeProjectPath(
      fromPath,
    );

  const normalizedTo =
    normalizeProjectPath(
      toPath,
    );

  requireMutationAllowed(
    contract,
    'rename',
    normalizedFrom,
  );

  requireMutationAllowed(
    contract,
    'rename',
    normalizedTo,
  );

  const listed =
    await this.operations
      .listFiles(
        contract,
      );

  const existing =
    new Set(
      listed.map(
        (
          file,
        ) =>
          normalizeProjectPath(
            file.path,
          ),
      ),
    );

  if (
    !existing.has(
      normalizedFrom,
    )
  ) {
    throw new Error(
      `RENAME_SOURCE_MISSING: ${normalizedFrom}`,
    );
  }

  if (
    existing.has(
      normalizedTo,
    )
  ) {
    throw new Error(
      `RENAME_TARGET_EXISTS: ${normalizedTo}`,
    );
  }

  const result =
    await this.operations
      .renameFile(
        contract,
        normalizedFrom,
        normalizedTo,
      );

  return {
    ...result,

    fromPath:
      normalizeProjectPath(
        result.fromPath,
      ),

    toPath:
      normalizeProjectPath(
        result.toPath,
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

    return this.operations
      .runCommand(
        contract,
        cleanedCommand,
      );
  }

  async runChecks(
    contract: SoftwareExecutionContract,
  ): Promise<SoftwareCheckResult[]> {
    return this.operations
      .runChecks(
        contract,
      );
  }

  async gitDiff(
    contract: SoftwareExecutionContract,
  ): Promise<GitDiffResult> {
    return this.operations
      .gitDiff(
        contract,
      );
  }

  async verifyPreview(
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

    return this.operations
      .verifyPreview(
        contract,
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

    if (
      !contract.repository
    ) {
      throw new Error(
        'NO_AUTHORIZED_REPOSITORY',
      );
    }

    return this.operations
      .createReviewBranch(
        contract,
      );
  }
}

export function createProductionSoftwareAgentToolHost(
  operations:
    ProductionSoftwareAgentOperations,
): SoftwareAgentToolHost {
  return new ProductionSoftwareAgentToolHost(
    operations,
  );
}
