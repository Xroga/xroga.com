import type {
  XrogaSoftwareAgentBindingImplementations,
} from './createXrogaSoftwareAgentBindings.js';

import type {
  SoftwareExecutionContract,
} from './contracts.js';

import type {
  CommandExecutionResult,
  ReviewBranchResult,
} from './toolHost.js';

import type {
  SoftwareCheckResult,
  SoftwarePreviewEvidence,
} from './contracts.js';

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
   *
   * Codex will map this onto compileValidateProject and any
   * applicable test/static validation already present.
   */
  runProjectChecks(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
  }): Promise<SoftwareCheckResult[]>;

  /**
   * Must start Preview from the supplied CURRENT workspace.
   */
  startProjectPreview(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    files: ProjectFile[];
  }): Promise<SoftwarePreviewEvidence>;

  /**
   * Probe the real Preview runtime.
   */
  probeProjectPreview(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    previewId: string;
  }): Promise<SoftwarePreviewEvidence>;

  /**
   * Must use Xroga's existing browser-verification path.
   */
  verifyProjectPreview(input: {
    userId: string;
    contract: SoftwareExecutionContract;
    previewId: string;
  }): Promise<SoftwarePreviewEvidence>;

  /**
   * Persist only verified work.
   *
   * Implementation must use Xroga's existing atomic GitHub
   * write/review-branch infrastructure.
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
 * Converts Xroga's existing production infrastructure into
 * the implementation surface consumed by
 * createXrogaSoftwareAgentBindings().
 *
 * This file intentionally contains no new sandbox,
 * validation, browser or GitHub implementation.
 */
export function createSoftwareAgentProductionImplementations(
  infrastructure: ExistingXrogaSoftwareInfrastructure,
): XrogaSoftwareAgentBindingImplementations {
  return {
    async runSandboxCommand(input) {
      return infrastructure
        .runSandboxCommand(input);
    },

    async runProjectChecks(input) {
      return infrastructure
        .runProjectChecks(input);
    },

    async startProjectPreview(input) {
      return infrastructure
        .startProjectPreview(input);
    },

    async probeProjectPreview(input) {
      return infrastructure
        .probeProjectPreview(input);
    },

    async verifyProjectPreview(input) {
      return infrastructure
        .verifyProjectPreview(input);
    },

    async createReviewBranch(input) {
      return infrastructure
        .createReviewBranch(input);
    },
  };
}
