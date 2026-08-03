/**
 * Read and write branch resolution, deliberately separated.
 *
 * `getBranchHeadSha` tries the requested branch, then `main`, then `master`. For a
 * *read* that is a reasonable convenience. For a *write* it is a defect: `pushFilesViaGitData`
 * resolved its target through it, so a push aimed at a branch that did not exist yet
 * silently committed to `main` instead — and then reported the branch it had asked for,
 * not the one it actually modified.
 *
 * Reads keep the fallback. Writes must name the branch exactly, and a missing branch is
 * either created deliberately from a verified base commit or refused. Nothing here ever
 * guesses which branch a mutation belongs on.
 */

export type BranchWriteFailure =
  | 'branch_missing'
  | 'branch_lookup_failed'
  | 'base_commit_missing'
  | 'branch_create_failed';

export class ExactBranchWriteError extends Error {
  readonly code = 'EXACT_BRANCH_WRITE_FAILED' as const;
  readonly reason: BranchWriteFailure;
  readonly requestedBranch: string;

  constructor(reason: BranchWriteFailure, requestedBranch: string, detail?: string) {
    super(detail ?? `Cannot write to branch "${requestedBranch}": ${reason}`);
    this.name = 'ExactBranchWriteError';
    this.reason = reason;
    this.requestedBranch = requestedBranch;
  }
}

export interface BranchRef {
  branch: string;
  sha: string;
}

export interface ResolvedWriteTarget extends BranchRef {
  /** True when this call created the branch rather than finding it. */
  created: boolean;
  /** The commit the branch was created from, when it was created. */
  baseSha?: string;
}

/** Minimal transport surface, so this is testable without a live GitHub. */
export interface BranchApi {
  getRef(branch: string): Promise<{ sha: string } | null>;
  createRef(branch: string, sha: string): Promise<boolean>;
}

/**
 * Resolves a branch for reading, falling back to the repository's usual defaults.
 *
 * Safe precisely because a read cannot corrupt anything — the worst case is reading
 * from `main` when a feature branch was meant, which the caller can detect from the
 * returned branch name.
 */
export async function resolveReadableBranch(
  api: BranchApi,
  preferredBranch: string | undefined,
  fallbacks: readonly string[] = ['main', 'master'],
): Promise<BranchRef | null> {
  const candidates = [...(preferredBranch ? [preferredBranch] : []), ...fallbacks];
  const seen = new Set<string>();
  for (const branch of candidates) {
    if (!branch || seen.has(branch)) continue;
    seen.add(branch);
    const ref = await api.getRef(branch);
    if (ref) return { branch, sha: ref.sha };
  }
  return null;
}

/**
 * Resolves a branch for writing. Never falls back.
 *
 * When the branch is missing, `createFromSha` decides between the two honest outcomes:
 * create it deliberately from a verified base commit, or refuse. There is no third
 * option where a write lands somewhere the caller did not name.
 */
export async function resolveExactWritableBranch(
  api: BranchApi,
  requestedBranch: string,
  options: { createFromSha?: string | null } = {},
): Promise<ResolvedWriteTarget> {
  if (!requestedBranch || !requestedBranch.trim()) {
    throw new ExactBranchWriteError('branch_missing', requestedBranch, 'No branch was specified for the write.');
  }

  let existing: { sha: string } | null;
  try {
    existing = await api.getRef(requestedBranch);
  } catch (error) {
    throw new ExactBranchWriteError(
      'branch_lookup_failed',
      requestedBranch,
      `Could not verify branch "${requestedBranch}": ${(error as Error).message}`,
    );
  }

  if (existing) return { branch: requestedBranch, sha: existing.sha, created: false };

  const baseSha = options.createFromSha;
  if (!baseSha) {
    throw new ExactBranchWriteError(
      'branch_missing',
      requestedBranch,
      `Branch "${requestedBranch}" does not exist and no base commit was provided to create it from. ` +
        'Refusing to write, because falling back to the default branch would modify code the request never named.',
    );
  }

  const created = await api.createRef(requestedBranch, baseSha);
  if (!created) {
    throw new ExactBranchWriteError(
      'branch_create_failed',
      requestedBranch,
      `Branch "${requestedBranch}" could not be created from ${baseSha.slice(0, 7)}.`,
    );
  }

  // Read back rather than trusting the create call — the returned SHA is what the
  // caller will report as the branch it wrote to, so it has to be observed.
  const confirmed = await api.getRef(requestedBranch);
  if (!confirmed) {
    throw new ExactBranchWriteError(
      'branch_create_failed',
      requestedBranch,
      `Branch "${requestedBranch}" was reported created but is not readable.`,
    );
  }

  return { branch: requestedBranch, sha: confirmed.sha, created: true, baseSha };
}

/**
 * Verifies that a mutation landed on the branch it claimed, at the commit it claimed.
 *
 * The evidence requirement: every external mutation reports repository, branch,
 * previous SHA and resulting SHA, and this is what makes the last two trustworthy
 * rather than assumed.
 */
export async function verifyBranchHead(
  api: BranchApi,
  branch: string,
  expectedSha: string,
): Promise<{ verified: boolean; actualSha: string | null }> {
  const ref = await api.getRef(branch);
  return { verified: ref?.sha === expectedSha, actualSha: ref?.sha ?? null };
}
