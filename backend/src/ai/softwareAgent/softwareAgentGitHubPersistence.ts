import {
  pushBuildToGitHub,
  type GitHubPushResult,
  type ProjectFile,
} from '../../services/integrations/githubDeploy.js';

import type {
  SoftwareExecutionContract,
} from './contracts.js';

export interface PersistSoftwareReviewBranchInput {
  userId: string;

  contract: SoftwareExecutionContract;

  files: ProjectFile[];

  deletedPaths: string[];
}

function requireRepository(
  contract: SoftwareExecutionContract,
) {
  if (!contract.repository) {
    throw new Error(
      'AUTHORIZED_REPOSITORY_REQUIRED',
    );
  }

  return contract.repository;
}

export async function persistSoftwareReviewBranch(
  input: PersistSoftwareReviewBranchInput,
): Promise<GitHubPushResult> {
  const {
    userId,
    contract,
    files,
    deletedPaths,
  } = input;

  if (
    contract.persistence !==
    'review_branch'
  ) {
    throw new Error(
      'REPOSITORY_PERSISTENCE_NOT_AUTHORIZED',
    );
  }

  if (
    contract.deployment !==
    'forbidden'
  ) {
    /*
     * Review-branch persistence is deliberately separate
     * from deployment during Agent V2 migration.
     */
    throw new Error(
      'SOFTWARE_AGENT_REVIEW_BRANCH_CANNOT_DEPLOY',
    );
  }

  const repository =
    requireRepository(contract);

  const targetRepo =
    `${repository.owner}/${repository.repo}`;

  /*
   * We intentionally do NOT set directWriteAuthorized.
   *
   * Xroga's existing GitHub layer must therefore preserve its
   * protected/review-branch behaviour rather than silently
   * writing directly to the user's base branch.
   */
  const result =
    await pushBuildToGitHub(
      userId,
      files,
      {
        targetRepo,

        targetBranch:
          repository.branch,

        deletePaths:
          deletedPaths,

        runId:
          contract.runId,

        /*
         * If the contract captured the exact source commit,
         * refuse stale writes when the branch has moved.
         */
        ...(repository.sourceCommit
          ? {
              expectedStartingHeadSha:
                repository.sourceCommit,
            }
          : {}),
      },
    );

  if (!result.commitSha) {
    throw new Error(
      'GITHUB_PERSISTENCE_DID_NOT_RETURN_COMMIT',
    );
  }

  if (!result.branch) {
    throw new Error(
      'GITHUB_PERSISTENCE_DID_NOT_RETURN_BRANCH',
    );
  }

  return result;
}
