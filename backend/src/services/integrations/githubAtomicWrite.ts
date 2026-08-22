/**
 * The single atomic write path to a GitHub repository.
 *
 * In an established repository, everything a build changes lands as **one tree, one
 * commit, one reference update**, or the branch is left exactly as it was. GitHub does
 * not expose its Git Data API for a completely empty repository, so that one case gets a
 * neutral initialization commit first; the complete product still lands as one atomic
 * commit and the marker is removed. There is no per-file product path. In particular there is
 * no per-file Contents API fallback: the Contents API writes one commit per file, so a build that
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
  | 'repository_initialization'
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
  /**
   * GitHub rejects every Git Data endpoint for a completely empty repository. This is
   * the one narrowly-scoped Contents API call allowed by the writer: a neutral marker
   * that creates the default branch before the product is committed atomically.
   */
  initializeEmptyRepository(input: {
    branch: string;
    path: string;
    content: string;
    message: string;
  }): Promise<{ commitSha: string }>;
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
  /** GitHub-mandated neutral initialization commit for a previously empty repository. */
  bootstrapCommitSha?: string;
  bootstrapPath?: string;
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
  branchUnchanged = true,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AtomicWriteError) throw error;
    throw new AtomicWriteError(name, 'stage_failed', `${detail}: ${(error as Error).message}`, {
      branchUnchanged,
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
 * GitHub's Contents API can acknowledge the first commit before the new branch ref is
 * readable through the Git Data API. A missing ref during that short propagation window
 * is not a concurrent writer. Retry only the missing observation; a different SHA is a
 * real race and is returned immediately.
 */
async function observeInitializedHead(
  api: AtomicWriteApi,
  branch: string,
): Promise<{ sha: string } | null> {
  const delaysMs = [0, 150, 300, 600, 1_200, 2_400];
  for (const delayMs of delaysMs) {
    if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    const observed = await api.getRef(branch);
    if (observed) return observed;
  }
  return null;
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
  // GitHub returns 409 from every Git Data endpoint until an empty repository has its
  // first commit. We therefore validate the complete product plan first, then create one
  // neutral marker through Contents, and finally replace it with the complete product in
  // one ordinary Git Data commit. A failure can expose the neutral marker, never a
  // half-written product.
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

  if (empty && request.defaultBranch !== request.branch) {
    throw new AtomicWriteError(
      'branch_resolution',
      'atomic_bootstrap_required',
      `An empty repository can only be initialised on its recorded default branch ` +
        `("${request.defaultBranch || 'unknown'}"), not "${request.branch}".`,
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

  let target: ResolvedWriteTarget = empty
    ? { branch: request.branch, sha: '', created: true }
    : await stage(
        'branch_resolution',
        `Could not resolve branch "${request.branch}"`,
        () =>
          resolveExactWritableBranch(api, request.branch, {
            createFromSha: request.createBranchFromSha ?? null,
          }),
      );

  const originalStartingHeadSha = empty ? null : target.sha;
  const bootstrapPath = '.xroga/bootstrap';
  let bootstrapCommitSha: string | undefined;

  // Refuse an invalid or empty generated product before the neutral initialization commit.
  if (empty) {
    const emptyTree = emptyStartingTree();
    const initialMutations =
      typeof request.mutations === 'function' ? request.mutations(emptyTree) : request.mutations;
    const initialPlan = await stage('planning', 'The requested changes were rejected', async () =>
      planMutation(emptyTree, initialMutations),
    );
    if (initialPlan.manifest.some((item) => item.path === bootstrapPath)) {
      throw new AtomicWriteError(
        'planning',
        'stage_failed',
        `The reserved bootstrap path "${bootstrapPath}" cannot be part of a generated product.`,
      );
    }

    let initialization: { commitSha: string };
    try {
      initialization = await api.initializeEmptyRepository({
          branch: request.branch,
          path: bootstrapPath,
          content: 'Initialized by Xroga AI. This marker is removed by the first product commit.\n',
          message: 'chore: initialize repository for Xroga build',
        });
    } catch (error) {
      const racedHead = await api.getRef(request.branch).catch(() => null);
      if (racedHead) {
        throw new AtomicWriteError(
          'repository_initialization',
          'concurrent_head_movement',
          `Branch "${request.branch}" was initialized by another writer. Xroga did not write ` +
            `the product and will not build on an unseen commit.`,
          {
            branchUnchanged: false,
            proposal: {
              branch: request.branch,
              plannedFromSha: '',
              observedHeadSha: racedHead.sha,
              manifest: initialPlan.manifest,
              preservedPaths: initialPlan.preservedPaths,
            },
            cause: error,
          },
        );
      }
      throw new AtomicWriteError(
        'repository_initialization',
        'stage_failed',
        `Could not initialize empty repository ${identity.owner}/${identity.repo}: ` +
          `${(error as Error).message}`,
        { branchUnchanged: true, cause: error },
      );
    }
    bootstrapCommitSha = initialization.commitSha;
    const observed = await stage(
      'repository_initialization',
      `Could not verify initialization of branch "${request.branch}"`,
      () => observeInitializedHead(api, request.branch),
      false,
    );
    if (!observed || observed.sha !== bootstrapCommitSha) {
      throw new AtomicWriteError(
        'repository_initialization',
        'concurrent_head_movement',
        `Repository initialization did not produce the expected branch head. The neutral ` +
          `initialization may have landed, but the product was not written.`,
        { branchUnchanged: false },
      );
    }
    target = { branch: request.branch, sha: bootstrapCommitSha, created: true };
  }

  const startingTree = await stage(
    'tree_snapshot',
    'Could not read the repository contents',
    () => readStartingTree(api, target.sha),
    !bootstrapCommitSha,
  );

  const plan = await stage('planning', 'The requested changes were rejected', async () => {
    const requested =
      typeof request.mutations === 'function' ? request.mutations(startingTree) : request.mutations;
    const mutations = bootstrapCommitSha
      ? [...requested, { kind: 'delete' as const, path: bootstrapPath }]
      : requested;
    return planMutation(startingTree, mutations);
  }, !bootstrapCommitSha);

  const proposal: MutationProposal = {
    branch: target.branch,
    plannedFromSha: target.sha,
    observedHeadSha: null,
    manifest: plan.manifest,
    preservedPaths: plan.preservedPaths,
  };

  let blobShaByPath: Map<string, string>;
  try {
    blobShaByPath = await uploadBlobs(api, plan);
  } catch (error) {
    if (bootstrapCommitSha && error instanceof AtomicWriteError) {
      throw new AtomicWriteError(error.stage, error.reason, `${error.message} The repository was initialized, but the product commit did not land.`, {
        branchUnchanged: false,
        cause: error,
      });
    }
    throw error;
  }
  const entries = finalizeTreeEntries(plan, blobShaByPath);

  const treeSha = await stage('tree_creation', 'Could not assemble the commit contents', () =>
    api.createTree(plan.baseTreeSha || null, entries),
    !bootstrapCommitSha,
  );

  const commitSha = await stage('commit_creation', 'Could not create the commit', () =>
    api.createCommit(request.message, treeSha, target.sha),
    !bootstrapCommitSha,
  );

  // Everything above produced unreferenced git objects. This is the only irreversible call.
  const update: RefUpdateOutcome = await stage(
    'ref_update',
    `Could not update branch "${target.branch}"`,
    () => api.updateRef(target.branch, commitSha),
    !bootstrapCommitSha,
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
          branchUnchanged: !bootstrapCommitSha,
          proposal: { ...proposal, observedHeadSha: observed?.sha ?? null },
        },
      );
    }
    throw new AtomicWriteError(
      'ref_update',
      'stage_failed',
      `Branch "${target.branch}" was not updated${update.detail ? `: ${update.detail}` : '.'} ` +
        (bootstrapCommitSha
          ? 'The repository was initialized, but the product commit did not land.'
          : 'Nothing was written.'),
      { branchUnchanged: !bootstrapCommitSha, proposal },
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
    startingHeadSha: originalStartingHeadSha,
    startingTreeSha: startingTree.treeSha,
    ...(bootstrapCommitSha ? { bootstrapCommitSha, bootstrapPath } : {}),
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
  if (!error.branchUnchanged && error.stage === 'repository_initialization') {
    return 'The repository branch changed during initialization, so Xroga refused to write the product on top of an unseen commit.';
  }
  if (!error.branchUnchanged && error.reason !== 'verification_mismatch') {
    return 'The repository was initialized, but the complete product commit did not land. No partial product files were published.';
  }
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
