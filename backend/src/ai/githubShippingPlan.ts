import type { ProjectFile } from './patches.js';
import type { ConnectedRepositoryState } from '../services/integrations/githubDeploy.js';

export interface GitHubShippingPlanInput {
  isUpdate: boolean;
  targetRepo?: string;
  nextFiles: ProjectFile[];
  changedFiles: ProjectFile[];
  deletedPaths: string[];
  priorCommitSha?: string;
  remoteState?: ConnectedRepositoryState;
}

export interface GitHubShippingPlan {
  filesToPush: ProjectFile[];
  reuseCommitSha?: string;
  blocker?: string;
}

/**
 * Reconcile the durable generated snapshot with the real remote branch.
 * An empty repository must receive the full snapshot even when an earlier
 * failed run already cached identical files locally.
 */
export function planGitHubShipping(input: GitHubShippingPlanInput): GitHubShippingPlan {
  if (!input.isUpdate) return { filesToPush: input.nextFiles };
  if (!input.targetRepo) return { filesToPush: input.changedFiles };

  if (input.remoteState?.status === 'empty') {
    return { filesToPush: input.nextFiles };
  }

  if (input.remoteState?.status === 'unavailable') {
    return {
      filesToPush: [],
      blocker: `Cannot safely verify ${input.targetRepo}: ${input.remoteState.reason}`,
    };
  }

  if (input.remoteState?.status === 'head') {
    if (input.priorCommitSha && input.priorCommitSha !== input.remoteState.headSha) {
      return {
        filesToPush: [],
        blocker: `GitHub branch changed after Xroga's last verified snapshot (${input.remoteState.headSha.slice(0, 12)}); refresh the repository before shipping`,
      };
    }

    if (
      input.priorCommitSha === input.remoteState.headSha &&
      input.changedFiles.length === 0 &&
      input.deletedPaths.length === 0
    ) {
      return { filesToPush: [], reuseCommitSha: input.remoteState.headSha };
    }

    // No verified prior SHA means the cached snapshot cannot prove equality
    // with the remote tree. Push the complete controlled snapshot rather than
    // silently treating an unverified branch as already shipped.
    if (!input.priorCommitSha) return { filesToPush: input.nextFiles };
  }

  return { filesToPush: input.changedFiles };
}
