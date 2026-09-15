import type {
  SoftwareExecutionContract,
} from './contracts.js';

import type {
  ReviewBranchResult,
} from './toolHost.js';

import {
  evaluateWritePolicy,
} from './writePolicy.js';

import {
  getGitHubToken,
} from '../../services/integrations/githubAuth.js';

import {
  ghFetch,
  type ProjectFile,
} from '../../services/integrations/githubDeploy.js';

import {
  writeAtomically,
} from '../../services/integrations/githubAtomicWrite.js';

import {
  makeAtomicWriteApi,
} from '../../services/integrations/githubAtomicTransport.js';

import {
  deriveFileSyncMutations,
  type MutationRequest,
  type StartingTree,
} from '../../services/integrations/githubMutationPlan.js';

import {
  planRunBranch,
} from '../../services/integrations/githubRunBranch.js';

export interface PersistSoftwareReviewBranchInput {
  userId: string;

  contract: SoftwareExecutionContract;

  /**
   * Complete verified working snapshot.
   *
   * Unchanged repository files may be present here.
   * The atomic mutation planner compares this snapshot with
   * the real source tree before deciding what must change.
   */
  files: ProjectFile[];

  /**
   * Authoritative changed-path set from the run-scoped
   * SoftwareAgentWorkspace.
   */
  changedPaths: string[];

  /**
   * Paths intentionally deleted from the working snapshot.
   */
  deletedPaths: string[];
}

function requireUserId(
  value: string,
): string {
  const userId =
    value.trim();

  if (!userId) {
    throw new Error(
      'Authenticated Xroga user is required.',
    );
  }

  return userId;
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

function normalizePath(
  value: string,
): string {
  const path =
    value
      .trim()
      .replace(/\\/g, '/');

  if (
    !path ||
    path.startsWith('/')
  ) {
    throw new Error(
      `INVALID_REPOSITORY_PATH: ${value}`,
    );
  }

  const parts =
    path.split('/');

  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..',
    )
  ) {
    throw new Error(
      `INVALID_REPOSITORY_PATH: ${value}`,
    );
  }

  return parts.join('/');
}

function uniquePaths(
  values: readonly string[],
): string[] {
  return [
    ...new Set(
      values.map(
        normalizePath,
      ),
    ),
  ].sort();
}

function mutationPaths(
  mutations: readonly MutationRequest[],
): string[] {
  const paths =
    new Set<string>();

  for (
    const mutation of
      mutations
  ) {
    if (
      mutation.kind ===
      'rename'
    ) {
      paths.add(
        normalizePath(
          mutation.from,
        ),
      );

      paths.add(
        normalizePath(
          mutation.to,
        ),
      );

      continue;
    }

    paths.add(
      normalizePath(
        mutation.path,
      ),
    );
  }

  return [
    ...paths,
  ].sort();
}

function samePathSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  for (
    let index = 0;
    index < left.length;
    index += 1
  ) {
    if (
      left[index] !==
      right[index]
    ) {
      return false;
    }
  }

  return true;
}

function assertMutationPolicy(
  contract: SoftwareExecutionContract,
  mutations: readonly MutationRequest[],
): void {
  for (
    const mutation of
      mutations
  ) {
    if (
      mutation.kind ===
      'rename'
    ) {
      const sourceDecision =
        evaluateWritePolicy(
          contract.writePolicy,
          'rename',
          mutation.from,
        );

      const targetDecision =
        evaluateWritePolicy(
          contract.writePolicy,
          'rename',
          mutation.to,
        );

      if (
        !sourceDecision.allowed ||
        !targetDecision.allowed
      ) {
        throw new Error(
          sourceDecision.message ??
            targetDecision.message ??
            'RENAME_SCOPE_DENIED',
        );
      }

      continue;
    }

    const operation =
      mutation.kind ===
      'create'
        ? 'create'
        : mutation.kind ===
            'delete'
          ? 'delete'
          : 'modify';

    const decision =
      evaluateWritePolicy(
        contract.writePolicy,
        operation,
        mutation.path,
      );

    if (
      !decision.allowed
    ) {
      throw new Error(
        decision.message ??
          'REPOSITORY_WRITE_SCOPE_DENIED',
      );
    }
  }
}

function buildVerifiedMutations(
  input: {
    contract: SoftwareExecutionContract;
    files: readonly ProjectFile[];
    deletedPaths: readonly string[];
    expectedChangedPaths: readonly string[];
  },
): (
  tree: StartingTree,
) => readonly MutationRequest[] {
  return (
    tree: StartingTree,
  ) => {
    /*
     * The mutation plan is derived from GitHub's REAL source
     * tree, not from remembered model state.
     *
     * This happens inside writeAtomically before any blob,
     * tree, commit or ref mutation becomes visible.
     */
    const mutations =
      deriveFileSyncMutations(
        tree,
        input.files,
        input.deletedPaths,
      );

    const actualPaths =
      mutationPaths(
        mutations,
      );

    if (
      !samePathSet(
        actualPaths,
        input.expectedChangedPaths,
      )
    ) {
      throw new Error(
        'WORKSPACE_GITHUB_DIFF_MISMATCH: ' +
          'The verified workspace change set does not match ' +
          'the mutation GitHub would receive.',
      );
    }

    /*
     * Persistence independently re-checks write authority.
     *
     * The model tool and production host already enforce the
     * policy, but repository persistence is a separate security
     * boundary and must not trust those earlier checks.
     */
    assertMutationPolicy(
      input.contract,
      mutations,
    );

    return mutations;
  };
}

/**
 * Persist an already-verified Agent V2 workspace to a
 * dedicated review branch.
 *
 * Security properties:
 *
 * - exact authenticated user
 * - exact authorized repository
 * - exact authorized base branch
 * - exact source SHA when the contract captured one
 * - dedicated xroga/<run-id> review branch
 * - existing review branch is never adopted
 * - one atomic Git commit
 * - write policy checked again at persistence
 * - workspace diff must equal GitHub mutation diff
 * - no direct write to the base branch
 * - no branch fallback
 * - no merge
 * - no deployment
 */
export async function persistSoftwareReviewBranch(
  input: PersistSoftwareReviewBranchInput,
): Promise<ReviewBranchResult> {
  const userId =
    requireUserId(
      input.userId,
    );

  const {
    contract,
  } = input;

  if (
    contract.persistence !==
    'review_branch'
  ) {
    throw new Error(
      'REPOSITORY_PERSISTENCE_NOT_AUTHORIZED',
    );
  }

  const repository =
    requireRepository(
      contract,
    );

  const changedPaths =
    uniquePaths(
      input.changedPaths,
    );

  const deletedPaths =
    uniquePaths(
      input.deletedPaths,
    );

  if (
    changedPaths.length ===
    0
  ) {
    throw new Error(
      'NO_CHANGES_TO_PERSIST',
    );
  }

  for (
    const deletedPath of
      deletedPaths
  ) {
    if (
      !changedPaths.includes(
        deletedPath,
      )
    ) {
      throw new Error(
        `DELETED_PATH_NOT_IN_CHANGESET: ${deletedPath}`,
      );
    }
  }

  const token =
    await getGitHubToken(
      userId,
    );

  if (
    !token
  ) {
    throw new Error(
      'GITHUB_NOT_CONNECTED',
    );
  }

  const api =
    makeAtomicWriteApi(
      ghFetch,
      token,
      repository.owner,
      repository.repo,
    );

  /*
   * Resolve exactly the branch named in the execution
   * contract. Never substitute main/master/default branch.
   */
  const baseRef =
    await api.getRef(
      repository.branch,
    );

  if (
    !baseRef?.sha
  ) {
    throw new Error(
      `AUTHORIZED_BASE_BRANCH_NOT_FOUND: ${repository.branch}`,
    );
  }

  /*
   * If planning captured a source commit, the base branch
   * must still point to it.
   *
   * A moved branch means the agent worked against stale
   * source. We refuse rather than silently rebasing or
   * overwriting work the run never inspected.
   */
  const sourceSha =
    repository.sourceCommit?.trim() ||
    baseRef.sha;

  if (
    repository.sourceCommit &&
    baseRef.sha !==
      repository.sourceCommit
  ) {
    throw new Error(
      'AUTHORIZED_BASE_BRANCH_MOVED',
    );
  }

  /*
   * Reserve a NEW run-scoped review-branch name.
   *
   * planRunBranch never adopts an existing xroga/<run-id>
   * branch. A collision receives a fresh suffixed name.
   */
  const review =
    await planRunBranch(
      api,
      {
        runId:
          contract.runId,

        sourceSha,

        baseBranch:
          repository.branch,
      },
    );

  const record =
    await writeAtomically(
      api,
      {
        owner:
          repository.owner,

        repo:
          repository.repo,
      },
      {
        branch:
          review.branch,

        createBranchFromSha:
          review.sourceSha,

        expectedStartingHeadSha:
          review.sourceSha,

        mutations:
          buildVerifiedMutations({
            contract,

            files:
              input.files,

            deletedPaths,

            expectedChangedPaths:
              changedPaths,
          }),

        message:
          `XROGA Agent V2 review — ${contract.runId}`,

        /*
         * The base branch is only the PR target.
         *
         * directWriteAuthorized is deliberately NOT supplied.
         */
        defaultBranch:
          repository.branch,

        pullRequest: {
          base:
            review.baseBranch,

          title:
            'XROGA Agent V2 review',

          body:
            'Verified software changes prepared by Xroga. ' +
            'Review and merge manually when ready.',
        },
      },
    );

  if (
    record.branch !==
    review.branch
  ) {
    throw new Error(
      'GITHUB_REVIEW_BRANCH_MISMATCH',
    );
  }

  if (
    !record.resultingCommitSha
  ) {
    throw new Error(
      'GITHUB_PERSISTENCE_DID_NOT_RETURN_COMMIT',
    );
  }

  if (
    !record.verified
  ) {
    throw new Error(
      'GITHUB_PERSISTENCE_NOT_VERIFIED',
    );
  }

  /*
   * This function deliberately performs no merge and no
   * deployment. Those authorities remain completely separate.
   */
  return {
    branch:
      record.branch,

    commitSha:
      record.resultingCommitSha,

    changedPaths,
  };
}
