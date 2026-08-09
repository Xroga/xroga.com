/**
 * The universal path's real commit step.
 *
 * Until this existed, `runBuildPipeline` handed `tryUniversalBuild` a `refusingCommit`,
 * so an enabled run reached the commit phase and threw by design. That refusal was the
 * correct placeholder — a run that reports success with nothing in source control is the
 * exact false evidence Command 2 exists to prevent — but it meant §9's requirement, that
 * the final write go through the Command 1 atomic path against a real connected
 * repository, could not be met at all.
 *
 * This closes it by delegating rather than reimplementing. Every property Command 1
 * established still holds because the write is literally `writeAtomically`:
 *
 * - one tree, one commit, one ref update, or nothing;
 * - the tree is built from the repository's real starting tree, not from what the
 *   pipeline remembers it generated;
 * - `xroga/<run-id>` is cut from an exact recorded source SHA and never falls back to
 *   the default branch;
 * - the ref update is compare-and-swap, so a branch that moved mid-run is a typed
 *   conflict rather than an overwrite;
 * - a pull request opens against the exact base the run started from.
 *
 * What is added here is only the binding: resolving which repository and base branch a
 * project's run belongs to, and surfacing the resulting record so the run's evidence can
 * name a branch, a starting SHA and a resulting SHA that were observed rather than
 * assumed.
 */

import { ghFetch } from '../services/integrations/githubDeploy.js';
import {
  makeAtomicWriteApi,
  type AtomicTransportOptions,
} from '../services/integrations/githubAtomicTransport.js';
import {
  AtomicWriteError,
  describeAtomicWriteFailure,
  writeAtomically,
  type AtomicWriteApi,
  type AtomicWriteRecord,
} from '../services/integrations/githubAtomicWrite.js';
import { planRunBranch, RunBranchError } from '../services/integrations/githubRunBranch.js';
import type { MutationRequest, StartingTree } from '../services/integrations/githubMutationPlan.js';
import type { CommitFn } from './productionAdapters.js';

/** Everything the run needs to report about where its code landed. */
export interface UniversalCommitRecord extends AtomicWriteRecord {
  /** The branch the run branched from and the pull request targets. */
  baseBranch: string;
  /** How many `xroga/<run-id>` names were already taken. */
  collisionsAvoided: number;
}

export class UniversalCommitError extends Error {
  readonly code = 'UNIVERSAL_COMMIT_FAILED' as const;
  /** True when the target branch is provably exactly where it was. */
  readonly branchUnchanged: boolean;

  constructor(message: string, branchUnchanged: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UniversalCommitError';
    this.branchUnchanged = branchUnchanged;
  }
}

/**
 * Splits generated files into creates and updates against the real starting tree.
 *
 * Deliberately a function of the tree rather than a precomputed list. The pipeline knows
 * which files it produced; it does not know which of them already exist on the branch,
 * and guessing is how a "create" silently clobbers a file the run never read. Files
 * present on the branch but absent from the generation are left alone — a build that
 * emits three files must not delete the rest of the repository.
 */
export function planUniversalMutations(
  files: readonly { path: string; content: string }[],
  tree: StartingTree,
): readonly MutationRequest[] {
  const existing = new Map(
    tree.entries.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry]),
  );

  return files.map((file): MutationRequest => {
    const current = existing.get(file.path);
    if (!current) return { kind: 'create', path: file.path, content: file.content };
    return {
      kind: 'update',
      path: file.path,
      content: file.content,
      // Executable bits survive a rewrite. Dropping to 100644 would silently break a
      // committed script, and the run would still report success.
      mode: current.mode === '100755' ? '100755' : '100644',
    };
  });
}

function commitIdentity(): AtomicTransportOptions['commitIdentity'] {
  const date = new Date().toISOString();
  const name = process.env.XROGA_GITHUB_BOT_NAME?.trim() || 'XROGA AI';
  const email =
    process.env.XROGA_GITHUB_BOT_EMAIL?.trim() ||
    '41898282+xroga-ai@users.noreply.github.com';
  return { author: { name, email, date }, committer: { name, email, date } };
}

export interface AtomicGitHubCommitInput {
  token: string;
  owner: string;
  repo: string;
  runId: string;
  /** The branch runs are cut from and pull requests target. */
  baseBranch: string;
  /** Called with the observed record once the write is verified. */
  onRecord?: (record: UniversalCommitRecord) => void;
  /** Injected in tests. Production builds the real transport from `token`. */
  api?: AtomicWriteApi;
}

/**
 * Builds the commit function an enabled universal run actually writes through.
 *
 * Replaces `refusingCommit` only when a repository is genuinely connected — the caller
 * keeps refusing otherwise, because "no repository" must stay a visible failure rather
 * than becoming a silently skipped step.
 */
export function atomicGitHubCommit(input: AtomicGitHubCommitInput): CommitFn {
  return async ({ files, message }) => {
    if (!files.length) {
      // A commit of nothing is not a success. The run generated no files, and saying
      // "committed" here would attach a SHA to an empty result.
      throw new UniversalCommitError(
        'Refusing to commit: the run produced no files, so there is nothing to write.',
        true,
      );
    }

    const api =
      input.api ??
      makeAtomicWriteApi(ghFetch, input.token, input.owner, input.repo, {
        commitIdentity: commitIdentity(),
      });

    // The exact commit this run branches from, read now and carried through the whole
    // write. Everything downstream is anchored to this SHA rather than re-reading HEAD,
    // which is what makes a concurrent push a detectable conflict instead of a race.
    const baseRef = await api.getRef(input.baseBranch);
    if (!baseRef) {
      throw new UniversalCommitError(
        `Refusing to commit: base branch "${input.baseBranch}" does not exist in ` +
          `${input.owner}/${input.repo}, so this run has no verified starting point.`,
        true,
      );
    }

    let plan;
    try {
      plan = await planRunBranch(api, {
        runId: input.runId,
        sourceSha: baseRef.sha,
        baseBranch: input.baseBranch,
      });
    } catch (error) {
      if (error instanceof RunBranchError) {
        throw new UniversalCommitError(`Refusing to commit: ${error.message}`, true, {
          cause: error,
        });
      }
      throw error;
    }

    try {
      const record = await writeAtomically(
        api,
        { owner: input.owner, repo: input.repo },
        {
          branch: plan.branch,
          createBranchFromSha: plan.sourceSha,
          mutations: (tree) => planUniversalMutations(files, tree),
          message,
          pullRequest: {
            base: plan.baseBranch,
            title: message.split('\n')[0]!.slice(0, 120),
            body: [
              'Opened by the Xroga universal engineering path.',
              '',
              `- Run: \`${input.runId}\``,
              `- Branch: \`${plan.branch}\` cut from \`${plan.sourceSha.slice(0, 7)}\``,
              `- Base: \`${plan.baseBranch}\``,
              '',
              'Every file in this pull request landed in a single atomic commit.',
            ].join('\n'),
          },
        },
      );

      const full: UniversalCommitRecord = {
        ...record,
        baseBranch: plan.baseBranch,
        collisionsAvoided: plan.collisionsAvoided,
      };
      input.onRecord?.(full);
      return { commitSha: full.resultingCommitSha };
    } catch (error) {
      if (error instanceof AtomicWriteError) {
        // The distinction the caller needs is not the stage but whether anything moved.
        // `describeAtomicWriteFailure` already states that in the message.
        throw new UniversalCommitError(describeAtomicWriteFailure(error), error.branchUnchanged, {
          cause: error,
        });
      }
      throw error;
    }
  };
}
