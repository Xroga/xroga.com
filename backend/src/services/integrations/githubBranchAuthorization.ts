/**
 * Whether a build may commit straight to a branch, or must propose to it.
 *
 * The default and any protected branch are the branches other people's work depends on.
 * A generated build landing on one of them without anybody choosing that is the difference
 * between "here is a change for review" and "your main branch is now whatever the model
 * produced". So the rule is: a run writes to its own `xroga/<run-id>` branch and opens a
 * pull request, and writing directly to a default or protected branch requires an explicit,
 * separate authorization carried on the request.
 *
 * "Explicit" means a caller passed it deliberately for this write. It is not inferred from
 * the branch already existing, from the user owning the repository, from a previous
 * authorization, or from the absence of a protection rule — an unreachable protection API
 * is treated as protected, because the safe answer to "is this branch protected?" when we
 * cannot tell is yes.
 */

export type BranchAuthorizationRefusal =
  | 'default_branch_requires_authorization'
  | 'protected_branch_requires_authorization'
  | 'protection_unknown';

export class BranchAuthorizationError extends Error {
  readonly code = 'BRANCH_WRITE_UNAUTHORIZED' as const;
  readonly reason: BranchAuthorizationRefusal;
  readonly branch: string;

  constructor(reason: BranchAuthorizationRefusal, branch: string, detail: string) {
    super(detail);
    this.name = 'BranchAuthorizationError';
    this.reason = reason;
    this.branch = branch;
  }
}

/** Transport surface for the protection check. */
export interface BranchProtectionApi {
  /**
   * `true`/`false` when GitHub answered, `null` when it could not be determined.
   * Note that a 403 (protection is a paid feature on some plans) is *not* an unknown —
   * the caller should map it to `false` only when the repository is private and on a plan
   * without protection rules, and to `null` otherwise.
   */
  isBranchProtected(branch: string): Promise<boolean | null>;
}

export interface BranchWriteAuthorizationRequest {
  branch: string;
  /** The repository's default branch, as reported by GitHub. */
  defaultBranch: string;
  /**
   * True only when a user deliberately chose to write to this branch directly for this
   * operation. Never defaulted to true anywhere.
   */
  directWriteAuthorized?: boolean;
}

export interface BranchWriteAuthorization {
  branch: string;
  /** True when the branch is the default or is protected. */
  requiresAuthorization: boolean;
  /** Carried through to the write record so the audit trail shows how it was permitted. */
  authorized: boolean;
  reason: 'run_branch' | 'explicitly_authorized';
}

function sameBranch(a: string, b: string): boolean {
  return a.replace(/^refs\/heads\//, '') === b.replace(/^refs\/heads\//, '');
}

/**
 * Authorizes a direct write, or refuses it.
 *
 * @throws {BranchAuthorizationError} when the branch needs authorization and none was given.
 */
export async function authorizeBranchWrite(
  api: BranchProtectionApi,
  request: BranchWriteAuthorizationRequest,
): Promise<BranchWriteAuthorization> {
  const branch = request.branch?.trim();
  if (!branch) {
    throw new BranchAuthorizationError(
      'protection_unknown',
      request.branch ?? '',
      'No branch was named, so it cannot be authorized for writing.',
    );
  }

  const isDefault = Boolean(request.defaultBranch) && sameBranch(branch, request.defaultBranch);

  let protectedBranch: boolean | null = false;
  if (!isDefault) {
    try {
      protectedBranch = await api.isBranchProtected(branch);
    } catch {
      protectedBranch = null;
    }
  }

  const requiresAuthorization = isDefault || protectedBranch !== false;

  if (!requiresAuthorization) {
    return { branch, requiresAuthorization: false, authorized: true, reason: 'run_branch' };
  }

  if (request.directWriteAuthorized === true) {
    return { branch, requiresAuthorization: true, authorized: true, reason: 'explicitly_authorized' };
  }

  if (isDefault) {
    throw new BranchAuthorizationError(
      'default_branch_requires_authorization',
      branch,
      `"${branch}" is this repository's default branch. Xroga will not commit to it without ` +
        'explicit approval — the change can go to its own branch with a pull request instead.',
    );
  }
  if (protectedBranch === null) {
    throw new BranchAuthorizationError(
      'protection_unknown',
      branch,
      `Whether "${branch}" is protected could not be determined. Treating it as protected and ` +
        'refusing the direct write rather than risking a push to a protected branch.',
    );
  }
  throw new BranchAuthorizationError(
    'protected_branch_requires_authorization',
    branch,
    `"${branch}" is a protected branch. Xroga will not commit to it without explicit approval.`,
  );
}

export function describeBranchAuthorizationRefusal(reason: BranchAuthorizationRefusal): string {
  switch (reason) {
    case 'default_branch_requires_authorization':
      return 'Committing to the default branch needs your explicit approval.';
    case 'protected_branch_requires_authorization':
      return 'Committing to a protected branch needs your explicit approval.';
    case 'protection_unknown':
      return "This branch's protection status could not be checked, so it was treated as protected.";
  }
}
