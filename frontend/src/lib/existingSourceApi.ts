'use client';

import { ApiError, apiDownload, apiFetch } from '@/lib/api';

/**
 * Existing-repository editor: client for /api/existing-source. Everything shown is what the backend recorded about the linked
 * repository; the browser never holds a GitHub token and never names a repository by anything but GitHub's own id.
 */

/** Off until Batch 3 is authorised for release (development only). */
export const EXISTING_SOURCE_ENABLED = process.env.NEXT_PUBLIC_XROGA_EXISTING_SOURCE === '1';

export type BindingState = 'linked' | 'access_lost' | 'transferred' | 'account_changed' | 'unlinked';

export interface RepositoryChoice {
  id: string;
  fullName: string;
  ownerType: string;
  private: boolean;
  archived: boolean;
  defaultBranch: string;
  canRead: boolean;
  canWrite: boolean;
  updatedAt: string;
}

export interface SourceBinding {
  id: string;
  originKind: 'github' | 'archive';
  projectId: string | null;
  providerRepositoryId: string;
  accountLogin: string;
  repositoryFullName: string;
  repositoryPrivate: boolean;
  repositoryArchived: boolean;
  baseBranch: string;
  baseCommitSha: string;
  permissions: { pull: boolean; push: boolean; admin: boolean };
  state: BindingState;
  stateReason: string;
  indexStatus: string;
  linkedAt: string;
  lastVerifiedAt: string;
}

export interface VerifiedBinding {
  binding: SourceBinding;
  head: { commitSha: string; moved: boolean; protected: boolean } | null;
  writable: boolean;
}

export interface ArchiveImport {
  binding: SourceBinding;
  created: boolean;
  report: { entries: number; kept: number; keptBytes: number; listedOnly: number; refused: Record<string, number> };
}

export interface DirectoryEntry {
  path: string;
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'submodule';
  size: number | null;
  sensitive: boolean;
}

export interface DirectoryListing {
  commitSha: string;
  path: string;
  entries: DirectoryEntry[];
  truncated: boolean;
  complete: boolean;
  partialReason: string | null;
  totalEntriesKnown: number;
}

export interface FileContent {
  commitSha: string;
  path: string;
  content: string;
  blobSha: string;
  truncated: boolean;
  redactions: number;
}

export type MapStatus = 'not_indexed' | 'valid' | 'partial' | 'stale' | 'unavailable';

export interface CodeMapStatus {
  bindingId: string;
  status: MapStatus;
  baseCommitSha: string;
  indexedCommitSha: string | null;
  behindHead: boolean | null;
  filesIndexed: number | null;
  coverage: { filesKnown: number; filesIndexed: number; treeComplete: boolean; partialReason: string | null } | null;
  builtAt: string | null;
  reason: string;
}

export interface CodeMapBuild {
  status: 'valid' | 'partial';
  commitSha: string;
  filesIndexed: number;
  packages: number;
  persisted: boolean;
  metrics: { kind: 'cold' | 'incremental' | 'reused'; blobFetches: number; bytesFetched: number; durationMs: number };
}

export interface SearchHit {
  path: string;
  name: string | null;
  kind: string;
  line: number | null;
  signature: string | null;
  exported: boolean | null;
  score: number;
}

export interface SearchResult {
  commitSha: string;
  results: SearchHit[];
  totalMatches: number;
  complete: boolean;
  coverageNote: string | null;
}

export interface ScoredFile { path: string; score: number; role: string; reasons: string[]; symbols: string[] }

export interface LocateResult {
  commitSha: string;
  status: 'valid' | 'partial';
  relevance: { targets: ScoredFile[]; consumers: ScoredFile[]; tests: ScoredFile[]; dependencies: ScoredFile[]; confidence: 'high' | 'medium' | 'low' };
  passport: { estimatedTokens: number; files: string[]; truncated: boolean };
}

export type ChangeStatus = 'queued' | 'planning' | 'working' | 'verifying' | 'repairing' | 'verified' | 'unverified' | 'failed' | 'cancelled' | 'interrupted' | 'delivered';

export interface ChangeRevision {
  n: number; at: string; digest: string; additions: number; deletions: number; warnings: string[]; diff: string; diffTruncated: boolean; note: string;
  files: { path: string; kind: 'created' | 'modified' | 'deleted'; additions: number; deletions: number; warnings: string[] }[];
  tests: { status: string; summary: string; runtime: string | null; evidence: string; stages: { label: string; kind: string; exitCode: number | null; timedOut: boolean; durationMs: number }[] } | null;
}

export interface DeliveryReceipt {
  kind: 'pull_request' | 'branch' | 'patch_export' | 'zip_export'; at: string; branch: string | null; commitSha: string | null; pullRequestNumber: number | null; pullRequestUrl: string | null;
  baseBranch: string | null; baseCommitSha: string; headAtDelivery: string | null; rebased: boolean; verified: boolean; draft: boolean; note: string;
}

export interface ChangeView {
  id: string; bindingId: string; instruction: string; status: ChangeStatus; statusReason: string; baseCommitSha: string;
  scope: { confidence: 'high' | 'medium' | 'low'; targets: string[]; consumers: string[]; tests: string[]; mapStatus: string } | null;
  acceptanceCriteria: string[]; attempts: number; maxAttempts: number; revisions: ChangeRevision[]; events: { at: string; type: string; message: string }[];
  files: { path: string; kind: 'created' | 'modified' | 'deleted' }[]; reproduction: 'reproduced' | 'not_reproduced' | 'not_applicable' | 'unavailable'; regressionTestAdded: boolean;
  deliveries: DeliveryReceipt[]; createdAt: string; updatedAt: string;
}

export interface DeliveryConflict { path: string; baseBlobSha: string | null; remoteBlobSha: string | null; reason: 'changed_on_remote' | 'created_on_remote' | 'deleted_on_remote' }

const base = '/api/existing-source';

export const existingSourceApi = {
  repositories: (page = 1) => apiFetch<{ account: { login: string }; repositories: RepositoryChoice[]; hasMore: boolean }>(`${base}/repositories?page=${page}`),
  link: (input: { repositoryId: string; branch?: string }) => apiFetch<{ binding: SourceBinding; created: boolean }>(`${base}/links`, { method: 'POST', body: JSON.stringify(input) }),
  importZip: (file: Blob, name: string) => apiFetch<ArchiveImport>(`${base}/archives?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file }),
  list: () => apiFetch<{ links: SourceBinding[] }>(`${base}/links`),
  verify: (id: string) => apiFetch<VerifiedBinding>(`${base}/links/${id}`),
  refresh: (id: string) => apiFetch<{ binding: SourceBinding; previousCommitSha: string; changed: boolean }>(`${base}/links/${id}/refresh`, { method: 'POST', body: '{}' }),
  unlink: (id: string) => apiFetch<unknown>(`${base}/links/${id}`, { method: 'DELETE' }),
  directory: (id: string, path = '') => {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return apiFetch<DirectoryListing>(`${base}/links/${id}/directory${query}`);
  },
  file: (id: string, path: string) => apiFetch<FileContent>(`${base}/links/${id}/file?path=${encodeURIComponent(path)}`),
  createChange: (bindingId: string, instruction: string) => apiFetch<{ change: ChangeView }>(`${base}/links/${bindingId}/changes`, { method: 'POST', body: JSON.stringify({ instruction }) }),
  changes: (bindingId: string) => apiFetch<{ changes: ChangeView[] }>(`${base}/links/${bindingId}/changes`),
  change: (changeId: string) => apiFetch<{ change: ChangeView }>(`${base}/changes/${changeId}`),
  cancelChange: (changeId: string) => apiFetch<{ change: ChangeView }>(`${base}/changes/${changeId}/cancel`, { method: 'POST', body: '{}' }),
  resumeChange: (changeId: string) => apiFetch<{ change: ChangeView }>(`${base}/changes/${changeId}/resume`, { method: 'POST', body: '{}' }),
  deliverChange: (changeId: string, options: { mode?: 'pull_request' | 'branch'; allowUnverified?: boolean } = {}) => apiFetch<{ receipt: DeliveryReceipt; alreadyDelivered: boolean; change: ChangeView }>(`${base}/changes/${changeId}/deliver`, { method: 'POST', body: JSON.stringify(options) }),
  indexStatus: (id: string) => apiFetch<CodeMapStatus>(`${base}/links/${id}/index`),
  buildIndex: (id: string) => apiFetch<CodeMapBuild>(`${base}/links/${id}/index`, { method: 'POST', body: '{}' }),
  search: (id: string, q: string) => apiFetch<SearchResult>(`${base}/links/${id}/search?q=${encodeURIComponent(q)}`),
  locate: (id: string, instruction: string) => apiFetch<LocateResult>(`${base}/links/${id}/locate`, { method: 'POST', body: JSON.stringify({ instruction }) }),
  neighborhood: (id: string, path: string) => apiFetch<{ path: string; dependsOn: string[]; dependedOnBy: string[]; tests: string[]; affected: string[] }>(`${base}/links/${id}/neighborhood?path=${encodeURIComponent(path)}`),
};

/** Downloads the patch or ZIP of a change with the signed-in session. */
export async function downloadChange(changeId: string, format: 'patch' | 'zip'): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename } = await apiDownload(`${base}/changes/${changeId}/export?format=${format}`);
  return { blob, filename: filename ?? `xroga-change.${format === 'zip' ? 'zip' : 'patch'}` };
}

/** What a person should read for a failure: never provider detail, never a token. */
export function existingSourceErrorMessage(error: unknown): string {
  const code = error instanceof ApiError ? String(error.data?.code ?? '') : '';
  switch (code) {
    case 'EXISTING_SOURCE_DISABLED': return 'Editing an existing repository is not available on this deployment yet.';
    case 'GITHUB_NOT_CONNECTED': return 'Connect your GitHub account to continue.';
    case 'REPO_NOT_AUTHORIZED': return 'That repository is not available to your connected GitHub account.';
    case 'REPO_PERMISSION_REVOKED': return 'Xroga no longer has access to this repository. Link it again after restoring access.';
    case 'REPO_TRANSFERRED': return 'This repository was transferred to a different owner. Link it again if that is intended.';
    case 'ACCOUNT_CHANGED': return 'A different GitHub account is connected now. Reconnect the original account or link the repository again.';
    case 'REPO_EMPTY': return 'That repository has no commits yet.';
    case 'BRANCH_NOT_FOUND': return 'That branch was not found in the repository.';
    case 'INDEX_UNAVAILABLE': return 'The code map is not current for the linked commit. Build it first.';
    case 'INDEX_BUSY': return 'Xroga is already building code maps for you. Try again in a moment.';
    case 'INVALID_ARCHIVE': return error instanceof ApiError && error.message ? error.message : 'That ZIP could not be imported.';
    case 'ARCHIVE_UNAVAILABLE': return 'The imported archive is no longer available. Import it again.';
    case 'CHANGE_NOT_FOUND': return 'That change was not found.';
    case 'CHANGE_BUSY': return 'Finish or cancel a running change before starting another.';
    case 'CHANGE_CONFLICT': return error instanceof ApiError && error.message ? error.message : 'The project changed while this was in progress. Start the change again.';
    case 'DELIVERY_REFUSED': return error instanceof ApiError && error.message ? error.message : 'This change cannot be delivered right now.';
    case 'DELIVERY_CONFLICT': return 'The branch changed files this change also touches. Export the patch or create the change again from the new commit.';
    case 'EXECUTION_UNAVAILABLE': return error instanceof ApiError && error.message ? error.message : 'Isolated execution is not available right now.';
    case 'SENSITIVE_PATH': return 'This file can hold credentials, so its content is never shown.';
    case 'SOURCE_UNREADABLE': return error instanceof ApiError && error.message ? error.message : 'That file could not be read at the linked commit.';
    case 'PROVIDER_RATE_LIMITED': return 'GitHub is limiting requests. Try again shortly.';
    case 'PROVIDER_UNAVAILABLE': return 'GitHub is unavailable right now. Try again shortly.';
    case 'NETWORK_ERROR': return 'Cannot reach Xroga. Check your connection and try again.';
    default: return error instanceof ApiError && error.message ? error.message : 'The request could not be completed.';
  }
}
