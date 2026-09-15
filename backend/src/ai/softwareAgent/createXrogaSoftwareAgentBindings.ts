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
  XrogaSoftwareAgentBindings,
} from './xrogaProductionAdapters.js';

import type {
  ProjectFile,
} from '../../services/integrations/githubDeploy.js';

export interface XrogaSoftwareAgentBindingImplementations {
  runSandboxCommand(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    command: string;
  }): Promise<CommandExecutionResult>;

  runProjectChecks(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
  }): Promise<SoftwareCheckResult[]>;

  /**
   * Run the existing one-shot browser verifier against the
   * supplied current workspace snapshot.
   */
  verifyProjectPreview(input: {
    userId: string;
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

function requireUserId(
  userId: string,
): string {
  const value =
    userId.trim();

  if (!value) {
    throw new Error(
      'Authenticated Xroga user is required.',
    );
  }

  return value;
}

function requirePreviewAllowed(
  contract:
    SoftwareExecutionContract,
): void {
  if (
    contract.preview ===
    'not_applicable'
  ) {
    throw new Error(
      'PREVIEW_NOT_APPLICABLE',
    );
  }
}

function requirePersistenceAllowed(
  contract:
    SoftwareExecutionContract,
): void {
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
      'AUTHORIZED_REPOSITORY_REQUIRED',
    );
  }
}

export function createXrogaSoftwareAgentBindings(
  input: {
    userId: string;

    implementations:
      XrogaSoftwareAgentBindingImplementations;
  },
): XrogaSoftwareAgentBindings {
  const userId =
    requireUserId(
      input.userId,
    );

  const {
    implementations,
  } = input;

  return {
    userId,

    async runSandboxCommand({
      contract,
      files,
      command,
    }) {
      const cleanedCommand =
        command.trim();

      if (
        !cleanedCommand
      ) {
        throw new Error(
          'Sandbox command is required.',
        );
      }

      return implementations
        .runSandboxCommand({
          userId,
          contract,
          files,

          command:
            cleanedCommand,
        });
    },

    async runProjectChecks({
      contract,
      files,
    }) {
      const checks =
        await implementations
          .runProjectChecks({
            userId,
            contract,
            files,
          });

      if (
        !Array.isArray(
          checks,
        )
      ) {
        throw new Error(
          'INVALID_CHECK_RESULT',
        );
      }

      return checks;
    },

    async verifyProjectPreview({
      contract,
      files,
      checks,
    }) {
      requirePreviewAllowed(
        contract,
      );

      return implementations
        .verifyProjectPreview({
          userId,
          contract,
          files,
          checks,
        });
    },

    async createReviewBranch({
      contract,
      files,
      changedPaths,
      deletedPaths,
    }) {
      requirePersistenceAllowed(
        contract,
      );

      if (
        changedPaths.length ===
        0
      ) {
        throw new Error(
          'NO_CHANGES_TO_PERSIST',
        );
      }

      return implementations
        .createReviewBranch({
          userId,
          contract,
          files,
          changedPaths,
          deletedPaths,
        });
    },
  };
}
