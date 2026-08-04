/**
 * Naming and claiming the branch a build writes to.
 *
 * A build gets its own branch, `xroga/<run-id>`, created from the exact commit the build
 * was planned against. Three properties this has to guarantee, none of which the previous
 * code did:
 *
 * - **The source commit is the recorded one.** Not "whatever `main` points at now". The
 *   branch is cut from the SHA the run captured, so the diff a reviewer sees is the diff
 *   the build actually produced.
 *
 * - **An existing branch is never adopted.** `xroga/<run-id>` colliding with something
 *   that already exists means either a retry of the same run or an unrelated branch. In
 *   both cases writing into it would mix two histories, so a fresh suffixed name is taken
 *   instead. The suffix is deterministic per attempt, not random, so a run's branches
 *   remain identifiable.
 *
 * - **The base branch is exact.** The pull request opens against the branch the run was
 *   cut from, by name. There is no default-branch fallback, because a PR opened against
 *   the wrong base proposes changes nobody requested.
 */

import type { BranchApi } from './githubBranchSafety.js';

export const RUN_BRANCH_PREFIX = 'xroga';
export const MAX_RUN_BRANCH_ATTEMPTS = 20;

export type RunBranchFailure = 'invalid_run_id' | 'no_available_name' | 'lookup_failed';

export class RunBranchError extends Error {
  readonly code = 'RUN_BRANCH_FAILED' as const;
  readonly reason: RunBranchFailure;

  constructor(reason: RunBranchFailure, detail: string) {
    super(detail);
    this.name = 'RunBranchError';
    this.reason = reason;
  }
}

/**
 * Reduces a run id to something git accepts as a ref component.
 *
 * git's rules (no `..`, no leading or trailing `.`, no `~^:?*[\`, no control characters,
 * no trailing `.lock`) are easier to satisfy by allowing a known-good set than by
 * enumerating the forbidden one.
 */
export function sanitizeRunId(runId: string): string {
  const cleaned = String(runId ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^[-._]+|[-._]+$/g, '')
    .replace(/\.lock$/, 'lock')
    .slice(0, 60);

  if (!cleaned) {
    throw new RunBranchError(
      'invalid_run_id',
      'This build has no usable run identifier, so it has no branch to write to.',
    );
  }
  return cleaned;
}

/** `xroga/<run-id>`, then `xroga/<run-id>-2`, `-3`, … for collisions. */
export function runBranchCandidate(runId: string, attempt: number): string {
  const base = `${RUN_BRANCH_PREFIX}/${sanitizeRunId(runId)}`;
  return attempt === 0 ? base : `${base}-${attempt + 1}`;
}

export interface RunBranchPlan {
  /** The branch to create and write to. */
  branch: string;
  /** The exact commit it is cut from. */
  sourceSha: string;
  /** The branch that commit came from — the pull request base. */
  baseBranch: string;
  /** How many names were already taken. Non-zero means a collision was avoided. */
  collisionsAvoided: number;
}

/**
 * Finds an unused `xroga/<run-id>` name.
 *
 * Only checks availability; the branch itself is created by the write path from
 * `sourceSha`, so there is exactly one place that creates refs. This does mean two
 * simultaneous runs could pick the same name — the loser's `createRef` fails and the
 * write refuses rather than writing into the winner's branch, which is the correct
 * outcome and is why the check here does not need to be a lock.
 */
export async function planRunBranch(
  api: BranchApi,
  input: { runId: string; sourceSha: string; baseBranch: string },
): Promise<RunBranchPlan> {
  if (!input.sourceSha) {
    throw new RunBranchError(
      'invalid_run_id',
      'No source commit was recorded for this build, so its branch has no verified starting point.',
    );
  }
  if (!input.baseBranch) {
    throw new RunBranchError(
      'invalid_run_id',
      'No base branch was recorded for this build, so a pull request would have no exact target.',
    );
  }

  for (let attempt = 0; attempt < MAX_RUN_BRANCH_ATTEMPTS; attempt++) {
    const branch = runBranchCandidate(input.runId, attempt);
    let existing: { sha: string } | null;
    try {
      existing = await api.getRef(branch);
    } catch (error) {
      throw new RunBranchError(
        'lookup_failed',
        `Could not check whether branch "${branch}" already exists: ${(error as Error).message}`,
      );
    }
    if (!existing) {
      return {
        branch,
        sourceSha: input.sourceSha,
        baseBranch: input.baseBranch,
        collisionsAvoided: attempt,
      };
    }
  }

  throw new RunBranchError(
    'no_available_name',
    `Every branch name from "${runBranchCandidate(input.runId, 0)}" through attempt ` +
      `${MAX_RUN_BRANCH_ATTEMPTS} is already taken. Refusing to write into an existing branch.`,
  );
}
