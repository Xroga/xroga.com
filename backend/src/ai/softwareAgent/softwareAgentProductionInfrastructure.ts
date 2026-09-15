import type {
  XrogaSoftwareAgentBindingImplementations,
} from './createXrogaSoftwareAgentBindings.js';

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
  ProjectFile,
} from '../../services/integrations/githubDeploy.js';

export interface ExistingXrogaSoftwareInfrastructure {
  /**
   * Must execute ONLY inside Xroga's existing isolated sandbox.
   *
   * Never use child_process directly on the API host.
   */
  runSandboxCommand(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    command: string;
  }): Promise<CommandExecutionResult>;

  /**
   * Must use Xroga's existing validation path.
   */
  runProjectChecks(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
  }): Promise<SoftwareCheckResult[]>;

  /**
   * Must use Xroga's existing one-shot browser-verification path.
   *
   * The implementation receives the current workspace snapshot
   * plus deterministic check evidence. It must not create a new
   * preview server or persistent preview-id subsystem.
   */
  verifyProjectPreview(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    checks: SoftwareCheckResult[];
  }): Promise<SoftwarePreviewEvidence>;

  /**
   * Persist only verified work through Xroga's existing atomic
   * GitHub review-branch infrastructure.
   */
  createReviewBranch(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
    changedPaths: string[];
    deletedPaths: string[];
  }): Promise<ReviewBranchResult>;
}

/**
 * Converts Xroga's existing production infrastructure into the
 * implementation surface consumed by Agent V2.
 *
 * This file intentionally contains no new sandbox, validator,
 * browser runtime or GitHub implementation.
 */
export function createSoftwareAgentProductionImplementations(
  infrastructure:
    ExistingXrogaSoftwareInfrastructure,
): XrogaSoftwareAgentBindingImplementations {
  return {
    async runSandboxCommand(
      input,
    ) {
      return infrastructure
        .runSandboxCommand(
          input,
        );
    },

    async runProjectChecks(
      input,
    ) {
      return infrastructure
        .runProjectChecks(
          input,
        );
    },

    async verifyProjectPreview(
      input,
    ) {
      return infrastructure
        .verifyProjectPreview(
          input,
        );
    },

    async createReviewBranch(
      input,
    ) {
      return infrastructure
        .createReviewBranch(
          input,
        );
    },
  };
}
