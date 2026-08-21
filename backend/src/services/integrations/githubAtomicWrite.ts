/**
 * The single atomic write path to a GitHub repository.
 *
 * Everything a build changes lands as **one tree, one commit, one reference update**, or
 * the branch is left exactly as it was. There is no second path. In particular there is
 * no Contents API fallback: the Contents API writes one commit per file, so a build that
 * failed halfway through it left a repository that was visibly, permanently half-changed
 * — and, worse, the fallback that used to catch every Git Data failure also caught the
 * concurrency refusal, retrying the clobber that the refusal existed to prevent.
 *
 * Ordering, and why it is this ordering:
 *
 *   1. resolve/create the target branch      — recorded, never guessed, never a fallback
 *   2. snapshot the starting tree            — the real one, from the recorded commit
 *   3. plan the mutation                     — resolved and validated against that tree
 *   4. upload blobs                          — dangling objects; invisible until referenced
 *   5. create the tree                       — still unreferenced
 *   6. create the commit                     — still unreferenced
 *   7. update the ref, compare-and-swap      — THE moment the change becomes real
 *   8. verify the branch head                — proves what we report actually happened
 *   9. open the pull request                 — optional, and never gates the write
 *
 * Steps 4-6 create git objects that nothing points at. If any of them fails, or step 7
 * fails, those objects are unreachable and get garbage collected; the branch never moved.
 * That is what makes "failed before the ref update" identical to "never started" from
 * every observer's point of view.
 *
 * Step 7 uses `force: false`, so GitHub itself rejects the update if the branch moved
 * since step 1. That rejection is a typed conflict carrying the plan, so the caller can
 * replan against the new head instead of overwriting a commit it never saw.
 */

import {
  resolveExactWritableBranch,
  verifyBranchHead,
  type BranchApi,
  type ResolvedWriteTarget,
} from './githubBranchSafety.js';
import {
  finalizeTreeEntries,
  planMutation,
  type MutationManifestItem,
  type MutationPlan,
  type MutationRequest,
  type ResolvedTreeEntry,
} from './githubMutationPlan.js';
import type { StartingTree } from './githubMutationPlan.js';
import { emptyStartingTree, readStartingTree, type TreeApi } from './githubTreeSnapshot.js';
import {
  authorizeBranchWrite,
  BranchAuthorizationError,
  type BranchProtectionApi,
} from './githubBranchAuthorization.js';

/** Every stage that can fail, named so a failure report says where it stopped. */
export type AtomicWriteStage =
  | 'branch_resolution'
  | 'tree_snapshot'
  | 'planning'
  | 'blob_creation'
  | 'tree_creation'
  | 'commit_creation'
  | 'ref_update'
  | 'verification'
  | 'pull_request';

export type AtomicWriteFailure =
  | 'stage_failed'
  | 'concurrent_head_movement'
  | 'atomic_bootstrap_required'
  | 'protected_branch_unauthorized'
  | 'verification_mismatch';

/**
 * What a caller needs to replan after losing a race.
 *
 * The manifest is the *intent* — five kinds of operation against named paths — not the
 * resolved tree entries, because those were resolved against a tree that is now stale.
 * Re-running `planMutation` against the new head is the correct recovery, and this is
 * everything required to do it.
 */
export interface MutationProposal {
  branch: string;
  /** The commit the refused plan was built against. */
  plannedFromSha: string;
  /** The commit the branch actually points at now. */
  observedHeadSha: string | null;
  manifest: MutationManifestItem[];
  preservedPaths: string[];
}

export class AtomicWriteError extends Error {
  readonly code = 'ATOMIC_WRITE_FAILED' as const;
  readonly stage: AtomicWriteStage;
  readonly reason: AtomicWriteFailure;
  /** True only when the branch is provably untouched. False means "verify before retrying". */
  readonly branchUnchanged: boolean;
  readonly proposal?: MutationProposal;

  constructor(
    stage: AtomicWriteStage,
    reason: AtomicWriteFailure,
    detail: string,
    options: { branchUnchanged?: boolean; proposal?: MutationProposal; cause?: unknown } = {},
  ) {
    super(detail);
    this.name = 'AtomicWriteError';
    this.stage = stage;
    this.reason = reason;
    // Everything up to and including a failed ref update leaves the branch alone. Only
    // verification failures are genuinely ambiguous, so they must opt out explicitly.
    this.branchUnchanged = options.branchUnchanged ?? true;
    this.proposal = options.proposal;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export interface RefUpdateOutcome {
  ok: boolean;
  /** True when GitHub refused because the branch moved (fast-forward check failed). */
  conflict?: boolean;
  detail?: string;
}

export interface PullRequestResult {
  number: number;
  htmlUrl: string;
}

/**
 * The complete transport surface of an atomic write.
 *
 * Deliberately one interface with one method per GitHub call. Tests implement it and fail
 * exactly one method to prove the abort behaviour of that stage; nothing needs to mock
 * `fetch`, and no test can accidentally pass because a URL string changed shape.
 */
export interface AtomicWriteApi extends BranchApi, TreeApi, BranchProtectionApi {
  createBlob(content: string): Promise<string>;
  createTree(baseTreeSha: string | null, entries: ResolvedTreeEntry[]): Promise<string>;
  createCommit(message: string, treeSha: string, parentSha: string | null): Promise<string>;
  /** Must send `force: false`. A refusal is reported, not thrown. */
  updateRef(branch: string, commitSha: string): Promise<RefUpdateOutcome>;
  isRepositoryEmpty(): Promise<boolean>;
  openPullRequest?(input: {
    head: string;
    base: string;
    title: string;
    body: string;
  }): Promise<PullRequestResult>;
}

export interface AtomicWriteRequest {
  /** The branch to write to. Exact. Never substituted. */
  branch: string;
  /** Required when `branch` may not exist yet: the commit to create it from. */
  createBranchFromSha?: string | null;
  /**
   * The changes to apply.
   *
   * A function receives the repository's real starting tree, which is what lets a caller
   * classify "here are the files" into creates and updates without having read the tree
   * itself — and without the write path accepting a plan built from remembered state.
   */
  mutations: readonly MutationRequest[] | ((tree: StartingTree) => readonly MutationRequest[]);
  message: string;
  /** Set when a pull request should follow the write. */
  pullRequest?: { base: string; title: string; body: string };
  /**
   * The repository's default branch. Used to decide whether this write needs explicit
   * authorization. Omitted means the check falls back to the protection API alone.
   */
  defaultBranch?: string;
  /**
   * Explicit authorization to write straight to a protected or default branch.
   * Never inferred — see `githubBranchAuthorization`.
   */
  directWriteAuthorized?: boolean;
  /** Authorizes creating the first branch in a repository proven empty at write time. */
  allowEmptyBootstrap?: boolean;
}

/** The criterion-2 record: everything needed to audit or reproduce the write. */
export interface AtomicWriteRecord {
  owner: string;
  repo: string;
  branch: string;
  /** True when this write created the branch. */
  branchCreated: boolean;
  /** The commit the branch pointed at before the write. */
  startingHeadSha: string | null;
  /** The tree that commit referenced. */
  startingTreeSha: string;
  resultingCommitSha: string;
  resultingTreeSha: string;
  manifest: MutationManifestItem[];
  preservedPaths: string[];
  blobsUploaded: number;
  verified: boolean;
  directWriteAuthorized: boolean;
  pullRequest?: PullRequestResult;
  /** Set when the PR could not be opened. The commit still landed; this is a warning. */
  pullRequestWarning?: string;
}

async function stage<T>(
  name: AtomicWriteStage,
  detail: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AtomicWriteError) throw error;
    throw new AtomicWriteError(name, 'stage_failed', `${detail}: ${(error as Error).message}`, {
      branchUnchanged: true,
      cause: error,
    });
  }
}

/**
 * Uploads blobs one at a time.
 *
 * Not batched, and that is fine: a blob nothing references is invisible and collectable,
 * so a partial upload set has no observable effect. Batching them would trade that
 * harmless property for a larger failure blast radius.
 */
async function uploadBlobs(
  api: AtomicWriteApi,
  plan: MutationPlan,
): Promise<Map<string, string>> {
  const shaByPath = new Map<string, string>();
  for (const pending of plan.pendingBlobs) {
    const sha = await stage('blob_creation', `Uploading "${pending.path}" failed`, () =>
      api.createBlob(pending.content),
    );
    if (!sha) {
      throw new AtomicWriteError(
        'blob_creation',
        'stage_failed',
        `GitHub returned no object id for "${pending.path}". Nothing was written.`,
      );
    }
    shaByPath.set(pending.path, sha);
  }
  return shaByPath;
}

/**
 * Applies a set of mutations to a branch, atomically or not at all.
 *
 * @throws {AtomicWriteError} on any stage failure. Except for `verification`, every
 * throw guarantees the branch is exactly where it was.
 */
export async function writeAtomically(
  api: AtomicWriteApi,
  identity: { owner: string; repo: string },
  request: AtomicWriteRequest,
): Promise<AtomicWriteRecord> {
  // An empty repository can still be initialised atomically through Git Data: create all
  // blobs, one root tree and one parentless commit, then make that commit visible with a
  // single create-ref call. The Contents API is not involved, so there is never a public
  // one-file intermediate state. This is allowed only when the caller carries explicit
  // direct-write authorization for the selected empty repository.
  const empty = await stage('branch_resolution', 'Could not determine repository state', () =>
    api.isRepositoryEmpty(),
  );
  if (
    empty &&
    !(request.directWriteAuthorized === true && request.allowEmptyBootstrap === true)
  ) {
    throw new AtomicWriteError(
      'branch_resolution',
      'atomic_bootstrap_required',
      `${identity.owner}/${identity.repo} has no commits yet. Initialising its first branch ` +
        'requires explicit authorization for this selected repository.',
    );
  }

  // Authorization comes before anything is created. Writing directly to a default or
  // protected branch is a decision a person makes, not something a build infers from
  // having a token that permits it.
  try {
    await authorizeBranchWrite(api, {
      branch: request.branch,
      defaultBranch: request.defaultBranch ?? '',
      directWriteAuthorized: request.directWriteAuthorized,
    });
  } catch (error) {
    if (error instanceof BranchAuthorizationError) {
      throw new AtomicWriteError(
        'branch_resolution',
        'protected_branch_unauthorized',
        error.message,
        { branchUnchanged: true, cause: error },
      );
    }
    throw error;
  }

  const target: ResolvedWriteTarget = empty
    ? { branch: request.branch, sha: '', created: true }
    : await stage(
        'branch_resolution',
        `Could not resolve branch "${request.branch}"`,
        () =>
          resolveExactWritableBranch(api, request.branch, {
            createFromSha: request.createBranchFromSha ?? null,
          }),
      );

  const startingHeadSha = empty ? null : target.sha;

  const startingTree = empty
    ? emptyStartingTree()
    : await stage('tree_snapshot', 'Could not read the repository contents', () =>
        readStartingTree(api, target.sha),
      );

  const plan = await stage('planning', 'The requested changes were rejected', async () => {
    const mutations =
      typeof request.mutations === 'function' ? request.mutations(startingTree) : request.mutations;
    return planMutation(startingTree, mutations);
  });

  const proposal: MutationProposal = {
    branch: target.branch,
    plannedFromSha: startingHeadSha ?? '',
    observedHeadSha: null,
    manifest: plan.manifest,
    preservedPaths: plan.preservedPaths,
  };

  const blobShaByPath = await uploadBlobs(api, plan);
  const entries = finalizeTreeEntries(plan, blobShaByPath);

  const treeSha = await stage('tree_creation', 'Could not assemble the commit contents', () =>
    api.createTree(plan.baseTreeSha || null, entries),
  );

  const commitSha = await stage('commit_creation', 'Could not create the commit', () =>
    api.createCommit(request.message, treeSha, startingHeadSha),
  );

  // Everything above produced unreferenced git objects. This is the only irreversible call.
  const update: RefUpdateOutcome = empty
    ? await stage('ref_update', `Could not create branch "${target.branch}"`, async () => ({
        ok: await api.createRef(target.branch, commitSha),
      }))
    : await stage('ref_update', `Could not update branch "${target.branch}"`, () =>
        api.updateRef(target.branch, commitSha),
      );

  if (!update.ok) {
    if (update.conflict) {
      const observed = await api.getRef(target.branch).catch(() => null);
      throw new AtomicWriteError(
        'ref_update',
        'concurrent_head_movement',
        `Branch "${target.branch}" moved while this build was running. Nothing was overwritten. ` +
          'The change is still available and can be re-applied on top of the new commit.',
        {
          branchUnchanged: true,
          proposal: { ...proposal, observedHeadSha: observed?.sha ?? null },
        },
      );
    }
    const observed = empty ? await api.getRef(target.branch).catch(() => null) : null;
    if (empty && observed) {
      throw new AtomicWriteError(
        'ref_update',
        'concurrent_head_movement',
        `Branch "${target.branch}" was created while this build was running. Nothing was overwritten.`,
        {
          branchUnchanged: true,
          proposal: { ...proposal, observedHeadSha: observed.sha },
        },
      );
    }
    throw new AtomicWriteError(
      'ref_update',
      'stage_failed',
      `Branch "${target.branch}" was not ${empty ? 'created' : 'updated'}${update.detail ? `: ${update.detail}` : '.'} ` +
        'Nothing was written.',
      { branchUnchanged: true, proposal },
    );
  }

  const verification = await verifyBranchHead(api, target.branch, commitSha).catch(() => ({
    verified: false,
    actualSha: null,
  }));

  if (!verification.verified) {
    // The ref update succeeded, so the branch probably did move. "Probably" is why this
    // is the one failure that cannot claim the branch is unchanged.
    throw new AtomicWriteError(
      'verification',
      'verification_mismatch',
      `Branch "${target.branch}" was updated to ${commitSha.slice(0, 7)} but reads back as ` +
        `${verification.actualSha?.slice(0, 7) ?? 'unreadable'}. Check the branch before retrying.`,
      { branchUnchanged: false },
    );
  }

  const record: AtomicWriteRecord = {
    owner: identity.owner,
    repo: identity.repo,
    branch: target.branch,
    branchCreated: target.created,
    startingHeadSha,
    startingTreeSha: startingTree.treeSha,
    resultingCommitSha: commitSha,
    resultingTreeSha: treeSha,
    manifest: plan.manifest,
    preservedPaths: plan.preservedPaths,
    blobsUploaded: blobShaByPath.size,
    verified: true,
    directWriteAuthorized: request.directWriteAuthorized === true,
  };

  if (request.pullRequest && api.openPullRequest) {
    // The commit has landed and is verified. A pull request is presentation on top of
    // that, so a failure here is reported as a warning rather than turning a successful
    // write into a failed one.
    try {
      record.pullRequest = await api.openPullRequest({
        head: target.branch,
        base: request.pullRequest.base,
        title: request.pullRequest.title,
        body: request.pullRequest.body,
      });
    } catch (error) {
      record.pullRequestWarning =
        `The changes were committed to "${target.branch}" but the pull request could not be ` +
        `opened: ${(error as Error).message}`;
    }
  }

  return record;
}

export function describeAtomicWriteFailure(error: AtomicWriteError): string {
  switch (error.reason) {
    case 'concurrent_head_movement':
      return 'Someone else pushed to this branch while the build was running, so the change was not applied. Nothing was overwritten.';
    case 'atomic_bootstrap_required':
      return 'This repository has no commits yet, so there is nothing to build on.';
    case 'protected_branch_unauthorized':
      return 'Writing directly to this branch needs explicit approval.';
    case 'verification_mismatch':
      return 'The commit was pushed but the branch did not read back as expected.';
    default:
      return `The change was not applied (${error.stage.replace(/_/g, ' ')}). Nothing was written.`;
  }
}
