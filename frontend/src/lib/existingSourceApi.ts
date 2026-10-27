'use client';

import { ApiError, apiFetch } from '@/lib/api';

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
  indexStatus: (id: string) => apiFetch<CodeMapStatus>(`${base}/links/${id}/index`),
  buildIndex: (id: string) => apiFetch<CodeMapBuild>(`${base}/links/${id}/index`, { method: 'POST', body: '{}' }),
  search: (id: string, q: string) => apiFetch<SearchResult>(`${base}/links/${id}/search?q=${encodeURIComponent(q)}`),
  locate: (id: string, instruction: string) => apiFetch<LocateResult>(`${base}/links/${id}/locate`, { method: 'POST', body: JSON.stringify({ instruction }) }),
  neighborhood: (id: string, path: string) => apiFetch<{ path: string; dependsOn: string[]; dependedOnBy: string[]; tests: string[]; affected: string[] }>(`${base}/links/${id}/neighborhood?path=${encodeURIComponent(path)}`),
};

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
    case 'SENSITIVE_PATH': return 'This file can hold credentials, so its content is never shown.';
    case 'SOURCE_UNREADABLE': return error instanceof ApiError && error.message ? error.message : 'That file could not be read at the linked commit.';
    case 'PROVIDER_RATE_LIMITED': return 'GitHub is limiting requests. Try again shortly.';
    case 'PROVIDER_UNAVAILABLE': return 'GitHub is unavailable right now. Try again shortly.';
    case 'NETWORK_ERROR': return 'Cannot reach Xroga. Check your connection and try again.';
    default: return error instanceof ApiError && error.message ? error.message : 'The request could not be completed.';
  }
}
