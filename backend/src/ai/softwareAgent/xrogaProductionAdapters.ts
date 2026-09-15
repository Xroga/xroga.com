import {
  fetchRepositoryTextFilesFromGitHub,
  type ProjectFile,
} from '../../services/integrations/githubDeploy.js';

import type {
  SoftwareCheckResult,
  SoftwareExecutionContract,
  SoftwarePreviewEvidence,
} from './contracts.js';

import type {
  CommandExecutionResult,
  ReviewBranchResult,
} from './toolHost.js';

import type {
  ProductionSoftwareAgentDependencies,
  ProductionSoftwareAgentRepositoryAdapter,
  ProductionSoftwareAgentRuntimeAdapter,
} from './productionOperations.js';

export interface XrogaSoftwareAgentBindings {
  /**
   * Authenticated Xroga user.
   *
   * Never expose this object to the model.
   */
  userId: string;

  runSandboxCommand(input: {
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    command: string;
  }): Promise<CommandExecutionResult>;

  runProjectChecks(input: {
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
  }): Promise<SoftwareCheckResult[]>;

  /**
   * Run Xroga's existing one-shot browser verification against
   * the supplied CURRENT workspace snapshot.
   */
  verifyProjectPreview(input: {
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    checks: SoftwareCheckResult[];
  }): Promise<SoftwarePreviewEvidence>;

  createReviewBranch(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    changedPaths: string[];
    deletedPaths: string[];
  }): Promise<ReviewBranchResult>;
}

function requireRepository(
  contract: SoftwareExecutionContract,
): NonNullable<
  SoftwareExecutionContract['repository']
> {
  if (
    !contract.repository
  ) {
    throw new Error(
      'AUTHORIZED_REPOSITORY_REQUIRED',
    );
  }

  return contract.repository;
}

function requireReviewBranchAuthority(
  contract: SoftwareExecutionContract,
): void {
  if (
    contract.persistence !==
    'review_branch'
  ) {
    throw new Error(
      'REPOSITORY_PERSISTENCE_NOT_AUTHORIZED',
    );
  }
}

function toProjectFiles(
  files: Array<{
    path: string;
    content: string;
  }>,
): ProjectFile[] {
  return files.map(
    (file) => ({
      path:
        file.path,

      content:
        file.content,
    }),
  );
}

export function createXrogaProductionRepositoryAdapter(
  bindings:
    XrogaSoftwareAgentBindings,
): ProductionSoftwareAgentRepositoryAdapter {
  return {
    async loadFiles(
      contract,
    ) {
      const repository =
        requireRepository(
          contract,
        );

      const files =
        await fetchRepositoryTextFilesFromGitHub(
          bindings.userId,
          `${repository.owner}/${repository.repo}`,
          repository.branch,
        );

      return files.map(
        (file) => ({
          path:
            file.path,

          content:
            file.content,
        }),
      );
    },

    async createReviewBranch(
      contract,
      input,
    ): Promise<ReviewBranchResult> {
      requireRepository(
        contract,
      );

      requireReviewBranchAuthority(
        contract,
      );

      if (
        input.changedPaths
          .length ===
        0
      ) {
        throw new Error(
          'NO_CHANGES_TO_PERSIST',
        );
      }

      return bindings
        .createReviewBranch({
          userId:
            bindings.userId,

          contract,

          files:
            toProjectFiles(
              input.files,
            ),

          changedPaths:
            input.changedPaths,

          deletedPaths:
            input.deletedPaths,
        });
    },
  };
}

export function createXrogaProductionRuntimeAdapter(
  bindings:
    XrogaSoftwareAgentBindings,
): ProductionSoftwareAgentRuntimeAdapter {
  return {
    async runCommand(
      contract,
      input,
    ) {
      return bindings
        .runSandboxCommand({
          contract,

          files:
            toProjectFiles(
              input.files,
            ),

          command:
            input.command,
        });
    },

    async runChecks(
      contract,
      input,
    ) {
      return bindings
        .runProjectChecks({
          contract,

          files:
            toProjectFiles(
              input.files,
            ),
        });
    },

    async verifyPreview(
      contract,
      input,
    ) {
      if (
        contract.preview ===
        'not_applicable'
      ) {
        throw new Error(
          'PREVIEW_NOT_APPLICABLE',
        );
      }

      return bindings
        .verifyProjectPreview({
          contract,

          files:
            toProjectFiles(
              input.files,
            ),

          checks:
            input.checks.map(
              (check) => ({
                ...check,
              }),
            ),
        });
    },
  };
}

export function createXrogaProductionDependencies(
  bindings:
    XrogaSoftwareAgentBindings,
): ProductionSoftwareAgentDependencies {
  return {
    repository:
      createXrogaProductionRepositoryAdapter(
        bindings,
      ),

    runtime:
      createXrogaProductionRuntimeAdapter(
        bindings,
      ),
  };
}
