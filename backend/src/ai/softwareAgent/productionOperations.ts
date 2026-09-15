import type {
  SoftwareCheckResult,
  SoftwareExecutionContract,
  SoftwarePreviewEvidence,
} from './contracts.js';

import type {
  CommandExecutionResult,
  FileMutationResult,
  FileWriteIntent,
  GitDiffResult,
  ProjectFileContent,
  ProjectFileSummary,
  ReviewBranchResult,
} from './toolHost.js';

import type {
  ProductionSoftwareAgentOperations,
} from './ProductionSoftwareAgentToolHost.js';

import {
  SoftwareAgentWorkspace,
} from './SoftwareAgentWorkspace.js';

export interface ProductionSoftwareAgentRepositoryAdapter {
  /**
   * Load the exact authorized repository/branch snapshot.
   */
  loadFiles(
    contract: SoftwareExecutionContract,
  ): Promise<
    Array<{
      path: string;
      content: string;
    }>
  >;

  /**
   * Persist the fully verified working snapshot to an
   * authorized review branch.
   *
   * Must never merge or deploy.
   */
  createReviewBranch(
    contract: SoftwareExecutionContract,
    input: {
      files: Array<{
        path: string;
        content: string;
      }>;

      changedPaths: string[];

      deletedPaths: string[];
    },
  ): Promise<ReviewBranchResult>;
}

export interface ProductionSoftwareAgentRuntimeAdapter {
  /**
   * Execute inside Xroga's isolated sandbox.
   */
  runCommand(
    contract: SoftwareExecutionContract,
    input: {
      files: Array<{
        path: string;
        content: string;
      }>;

      command: string;
    },
  ): Promise<CommandExecutionResult>;

  /**
   * Run deterministic checks against the CURRENT working
   * snapshot.
   */
  runChecks(
    contract: SoftwareExecutionContract,
    input: {
      files: Array<{
        path: string;
        content: string;
      }>;
    },
  ): Promise<SoftwareCheckResult[]>;

  /**
   * Run ONE isolated browser/runtime verification against the
   * CURRENT working snapshot.
   *
   * Xroga's real verifier starts the application and browser
   * inside the same disposable sandbox execution. There is no
   * persistent preview id.
   */
  verifyPreview(
    contract: SoftwareExecutionContract,
    input: {
      files: Array<{
        path: string;
        content: string;
      }>;

      /**
       * Latest deterministic check evidence from this same
       * workspace. The production verifier can use it to map
       * build/test preconditions without trusting the model.
       */
      checks: SoftwareCheckResult[];
    },
  ): Promise<SoftwarePreviewEvidence>;
}

export interface ProductionSoftwareAgentDependencies {
  repository:
    ProductionSoftwareAgentRepositoryAdapter;

  runtime:
    ProductionSoftwareAgentRuntimeAdapter;
}

export interface ProductionSoftwareAgentOperationsSession {
  operations:
    ProductionSoftwareAgentOperations;

  workspace:
    SoftwareAgentWorkspace;
}

function buildSimpleUnifiedDiff(
  changes: ReturnType<
    SoftwareAgentWorkspace['getChanges']
  >,
): string {
  if (
    changes.length ===
    0
  ) {
    return '';
  }

  const chunks:
    string[] =
    [];

  for (
    const change of
    changes
  ) {
    chunks.push(
      `diff --xroga a/${change.path} b/${change.path}`,
    );

    if (
      change.kind ===
      'created'
    ) {
      chunks.push(
        '--- /dev/null',
      );

      chunks.push(
        `+++ b/${change.path}`,
      );

      for (
        const line of
        (change.after ?? '')
          .split(
            /\r?\n/,
          )
      ) {
        chunks.push(
          `+${line}`,
        );
      }

      continue;
    }

    if (
      change.kind ===
      'deleted'
    ) {
      chunks.push(
        `--- a/${change.path}`,
      );

      chunks.push(
        '+++ /dev/null',
      );

      for (
        const line of
        (change.before ?? '')
          .split(
            /\r?\n/,
          )
      ) {
        chunks.push(
          `-${line}`,
        );
      }

      continue;
    }

    chunks.push(
      `--- a/${change.path}`,
    );

    chunks.push(
      `+++ b/${change.path}`,
    );

    for (
      const line of
      (change.before ?? '')
        .split(
          /\r?\n/,
        )
    ) {
      chunks.push(
        `-${line}`,
      );
    }

    for (
      const line of
      (change.after ?? '')
        .split(
          /\r?\n/,
        )
    ) {
      chunks.push(
        `+${line}`,
      );
    }
  }

  return chunks.join(
    '\n',
  );
}

function countChangedLines(
  changes: ReturnType<
    SoftwareAgentWorkspace['getChanges']
  >,
): {
  additions: number;
  deletions: number;
} {
  let additions =
    0;

  let deletions =
    0;

  for (
    const change of
    changes
  ) {
    const beforeLines =
      change.before ===
      undefined
        ? []
        : change.before.split(
            /\r?\n/,
          );

    const afterLines =
      change.after ===
      undefined
        ? []
        : change.after.split(
            /\r?\n/,
          );

    if (
      change.kind ===
      'created'
    ) {
      additions +=
        afterLines.length;

      continue;
    }

    if (
      change.kind ===
      'deleted'
    ) {
      deletions +=
        beforeLines.length;

      continue;
    }

    additions +=
      Math.max(
        0,
        afterLines.length -
          Math.min(
            beforeLines.length,
            afterLines.length,
          ),
      );

    deletions +=
      Math.max(
        0,
        beforeLines.length -
          Math.min(
            beforeLines.length,
            afterLines.length,
          ),
      );
  }

  return {
    additions,
    deletions,
  };
}

/**
 * Create one stateful production-operations session.
 *
 * The workspace snapshot is durable for the agent run even
 * though each sandbox execution remains disposable.
 */
export async function createProductionSoftwareAgentOperations(
  contract: SoftwareExecutionContract,
  dependencies:
    ProductionSoftwareAgentDependencies,
): Promise<ProductionSoftwareAgentOperationsSession> {
  const initialFiles =
    contract.repository
      ? await dependencies
          .repository
          .loadFiles(
            contract,
          )
      : [];

  const workspace =
    new SoftwareAgentWorkspace(
      initialFiles,
    );

  let latestChecks:
    SoftwareCheckResult[] =
    [];

  const operations:
    ProductionSoftwareAgentOperations = {
      async listFiles():
        Promise<
          ProjectFileSummary[]
        > {
        return workspace.listFiles();
      },

      async readFiles(
        _contract,
        paths,
      ): Promise<
        ProjectFileContent[]
      > {
        return workspace.readFiles(
          paths,
        );
      },

      async searchProject(
        _contract,
        query,
      ) {
        return workspace.search(
          query,
        );
      },

      async writeFile(
        _contract,
        path,
        content,
        intent:
          FileWriteIntent,
      ): Promise<FileMutationResult> {
        return workspace.writeFile(
          path,
          content,
          intent,
        );
      },

      async deleteFile(
        _contract,
        path,
      ) {
        return workspace.deleteFile(
          path,
        );
      },

      async runCommand(
        currentContract,
        command,
      ): Promise<CommandExecutionResult> {
        return dependencies.runtime
          .runCommand(
            currentContract,
            {
              files:
                workspace.getFiles(),

              command,
            },
          );
      },

      async runChecks(
        currentContract,
      ): Promise<
        SoftwareCheckResult[]
      > {
        const checks =
          await dependencies.runtime
            .runChecks(
              currentContract,
              {
                files:
                  workspace.getFiles(),
              },
            );

        latestChecks =
          checks.map(
            (check) => ({
              ...check,
            }),
          );

        return checks;
      },

      async gitDiff():
        Promise<
          GitDiffResult
        > {
        const changes =
          workspace.getChanges();

        const counts =
          countChangedLines(
            changes,
          );

        return {
          changedPaths:
            changes.map(
              (change) =>
                change.path,
            ),

          diff:
            buildSimpleUnifiedDiff(
              changes,
            ),

          additions:
            counts.additions,

          deletions:
            counts.deletions,
        };
      },

      async verifyPreview(
        currentContract,
      ): Promise<SoftwarePreviewEvidence> {
        return dependencies.runtime
          .verifyPreview(
            currentContract,
            {
              files:
                workspace.getFiles(),

              checks:
                latestChecks.map(
                  (check) => ({
                    ...check,
                  }),
                ),
            },
          );
      },

      async createReviewBranch(
        currentContract,
      ): Promise<ReviewBranchResult> {
        const changes =
          workspace.getChanges();

        if (
          changes.length ===
          0
        ) {
          throw new Error(
            'NO_CHANGES_TO_PERSIST',
          );
        }

        const deletedPaths =
          changes
            .filter(
              (change) =>
                change.kind ===
                'deleted',
            )
            .map(
              (change) =>
                change.path,
            );

        return dependencies
          .repository
          .createReviewBranch(
            currentContract,
            {
              files:
                workspace.getFiles(),

              changedPaths:
                changes.map(
                  (change) =>
                    change.path,
                ),

              deletedPaths,
            },
          );
      },
    };

  return {
    operations,
    workspace,
  };
}
