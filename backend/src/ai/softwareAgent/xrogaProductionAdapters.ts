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

  /**
   * Execute one command against the supplied working snapshot
   * inside Xroga's existing isolated sandbox.
   */
  runSandboxCommand(input: {
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    command: string;
  }): Promise<CommandExecutionResult>;

  /**
   * Run Xroga's existing deterministic validation against the
   * supplied current workspace snapshot.
   */
  runProjectChecks(input: {
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
  }): Promise<SoftwareCheckResult[]>;

  /**
   * Start Xroga's real Preview using the supplied current
   * working snapshot.
   */
  startProjectPreview(input: {
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
  }): Promise<SoftwarePreviewEvidence>;

  /**
   * Probe an existing Preview.
   */
  probeProjectPreview(input: {
    contract: SoftwareExecutionContract;
    previewId: string;
  }): Promise<SoftwarePreviewEvidence>;

  /**
   * Run Xroga's existing browser verification.
   */
  verifyProjectPreview(input: {
    contract: SoftwareExecutionContract;
    previewId: string;
  }): Promise<SoftwarePreviewEvidence>;

  /**
   * Persist already-verified work.
   *
   * The implementation MUST:
   *
   * - branch from the exact authorized base
   * - use one atomic commit
   * - never silently fall back to main
   * - never merge
   * - never deploy
   */
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
  if (!contract.repository) {
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
  return files.map((file) => ({
    path: file.path,
    content: file.content,
  }));
}

export function createXrogaProductionRepositoryAdapter(
  bindings: XrogaSoftwareAgentBindings,
): ProductionSoftwareAgentRepositoryAdapter {
  return {
    async loadFiles(contract) {
      const repository =
        requireRepository(contract);

      /*
       * Use Xroga's universal repository reader here.
       *
       * Agent V2 must receive the real text source tree for the exact
       * authorized branch, not the older web/build-focused hydration set.
       */
      const files =
        await fetchRepositoryTextFilesFromGitHub(
          bindings.userId,
          `${repository.owner}/${repository.repo}`,
          repository.branch,
        );

      return files.map((file) => ({
        path: file.path,
        content: file.content,
      }));
    },

    async createReviewBranch(
      contract,
      input,
    ): Promise<ReviewBranchResult> {
      requireRepository(contract);
      requireReviewBranchAuthority(
        contract,
      );

      if (
        input.changedPaths.length === 0
      ) {
        throw new Error(
          'NO_CHANGES_TO_PERSIST',
        );
      }

      return bindings.createReviewBranch({
        userId: bindings.userId,

        contract,

        files: toProjectFiles(
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
  bindings: XrogaSoftwareAgentBindings,
): ProductionSoftwareAgentRuntimeAdapter {
  return {
    async runCommand(
      contract,
      input,
    ) {
      return bindings.runSandboxCommand({
        contract,

        files: toProjectFiles(
          input.files,
        ),

        command: input.command,
      });
    },

    async runChecks(
      contract,
      input,
    ) {
      return bindings.runProjectChecks({
        contract,

        files: toProjectFiles(
          input.files,
        ),
      });
    },

    async startPreview(
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

      return bindings.startProjectPreview({
        contract,

        files: toProjectFiles(
          input.files,
        ),
      });
    },

    async probePreview(
      contract,
      input,
    ) {
      return bindings.probeProjectPreview({
        contract,
        previewId:
          input.previewId,
      });
    },

    async verifyPreview(
      contract,
      input,
    ) {
      return bindings.verifyProjectPreview({
        contract,
        previewId:
          input.previewId,
      });
    },
  };
}

export function createXrogaProductionDependencies(
  bindings: XrogaSoftwareAgentBindings,
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
