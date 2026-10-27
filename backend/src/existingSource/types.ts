/**
 * Existing-source projects (Batch 3, Phase 1): an EXISTING repository linked to an Xroga project.
 *
 * Identity is the provider's immutable repository id, bound to the connected account that authorised it and to one exact commit.
 * Names, URLs and branches are display and provenance data only: nothing resolves a write or a read by a name alone.
 */

export type BindingState = 'linked' | 'access_lost' | 'transferred' | 'account_changed' | 'unlinked';
export type IndexStatus = 'not_indexed' | 'indexing' | 'valid' | 'stale' | 'partial' | 'failed' | 'unsupported';

export interface RepositoryPermissions { readonly pull: boolean; readonly push: boolean; readonly admin: boolean }

export interface SourceBinding {
  readonly id: string;
  readonly ownerUserId: string;
  /** The Xroga project this binding shows up as, when one was created. */
  readonly projectId: string | null;
  readonly originKind: 'github';
  /** GitHub's immutable numeric repository id, as a string. */
  readonly providerRepositoryId: string;
  /** The connected GitHub account (user id) that authorised the link. */
  readonly accountBindingId: string;
  readonly accountLogin: string;
  readonly installationId: string | null;
  /** The repository owner's account id at link time. A different value later means the repository was transferred. */
  readonly ownerAccountId: string;
  readonly repositoryFullName: string;
  readonly repositoryPrivate: boolean;
  readonly repositoryArchived: boolean;
  readonly baseBranch: string;
  /** The exact commit all reads are pinned to. Never a branch name. */
  readonly baseCommitSha: string;
  readonly permissions: RepositoryPermissions;
  readonly state: BindingState;
  readonly stateReason: string;
  readonly indexStatus: IndexStatus;
  readonly linkedAt: string;
  readonly lastVerifiedAt: string;
  readonly updatedAt: string;
}

export type ExistingSourceErrorCode =
  | 'EXISTING_SOURCE_DISABLED'
  | 'GITHUB_NOT_CONNECTED'
  | 'REPO_NOT_AUTHORIZED'
  | 'REPO_PERMISSION_REVOKED'
  | 'REPO_TRANSFERRED'
  | 'ACCOUNT_CHANGED'
  | 'REPO_EMPTY'
  | 'BRANCH_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'BINDING_NOT_FOUND'
  | 'BINDING_NOT_ACTIVE'
  | 'SENSITIVE_PATH'
  | 'SOURCE_UNREADABLE'
  | 'PROVIDER_RATE_LIMITED'
  | 'INDEX_BUSY'
  | 'INDEX_UNAVAILABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'STORAGE_FAILED';

const STATUS: Record<ExistingSourceErrorCode, number> = {
  EXISTING_SOURCE_DISABLED: 503,
  GITHUB_NOT_CONNECTED: 401,
  // Not authorised and not found are one answer on purpose: a guessed private repository id must not reveal that it exists.
  REPO_NOT_AUTHORIZED: 404,
  REPO_PERMISSION_REVOKED: 403,
  REPO_TRANSFERRED: 409,
  ACCOUNT_CHANGED: 409,
  REPO_EMPTY: 422,
  BRANCH_NOT_FOUND: 404,
  INVALID_REQUEST: 400,
  BINDING_NOT_FOUND: 404,
  BINDING_NOT_ACTIVE: 409,
  SENSITIVE_PATH: 403,
  SOURCE_UNREADABLE: 422,
  PROVIDER_RATE_LIMITED: 429,
  INDEX_BUSY: 429,
  INDEX_UNAVAILABLE: 409,
  PROVIDER_UNAVAILABLE: 503,
  STORAGE_FAILED: 503,
};

export class ExistingSourceError extends Error {
  readonly status: number;
  constructor(readonly code: ExistingSourceErrorCode, message: string) {
    super(message);
    this.name = 'ExistingSourceError';
    this.status = STATUS[code];
  }
}

/** What a provider call can fail with, independent of the HTTP library. */
export type ProviderFailure = 'not_found' | 'forbidden' | 'unauthorized' | 'rate_limited' | 'unavailable' | 'empty';

export class ProviderError extends Error {
  constructor(readonly kind: ProviderFailure, message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}
