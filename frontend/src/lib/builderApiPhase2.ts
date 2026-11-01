'use client';

import { createClient } from '@/lib/supabase/client';
import { API_URL, fetchApiResponse } from '@/lib/api';
import { BuilderApiError, request } from '@/lib/builderApi';

/** AI Product Builder Phase 2 client: browser QA and repair, history, source export and GitHub. */

export type QaStatus = 'passed' | 'failed' | 'partial' | 'pending_runtime';

export interface QaSummary {
  status: QaStatus;
  revisionId: string;
  runId: string;
  executedChecks: number;
  failedChecks: number;
  pendingChecks: number;
  reason: string;
  verificationId: string;
}

export interface QaCheckResult {
  id: string;
  title: string;
  category: string;
  viewport: 'desktop' | 'mobile';
  status: 'passed' | 'failed' | 'pending';
  executed: boolean;
  failureClass: string | null;
  pendingReason: string | null;
  regression: boolean;
  evidence: { failedStep: string | null; message: string | null; url: string | null; screenshot: string | null; pageErrors: string[] } | null;
}

export interface QaReport {
  status: QaStatus;
  executedChecks: number;
  passedChecks: number;
  failedChecks: number;
  pendingChecks: number;
  checks: QaCheckResult[];
  notChecked: Array<{ criterion: string; reason: string }>;
  environment: { driver: string; browser: string | null };
  reason: string;
}

export interface RepairResult {
  status: 'passed' | 'repaired' | 'unrepaired' | 'exhausted' | 'stalled' | 'budget_exhausted' | 'pending_runtime' | 'engine_unavailable' | 'cancelled';
  reason: string;
  attempts: Array<{ attempt: number; outcome: string; reason: string; revisionId: string | null }>;
  headRevisionNumber: number;
  qa: { status: QaStatus; executedChecks: number; failedChecks: number; pendingChecks: number; reason: string };
}

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  patch: string | null;
  truncated: boolean;
}

export interface RevisionDiff {
  from: { id: string; revisionNumber: number } | null;
  to: { id: string; revisionNumber: number };
  files: FileDiff[];
  totals: { added: number; modified: number; deleted: number; additions: number; deletions: number };
  omittedFiles: number;
}

export interface GitHubOwner {
  login: string;
  id: number;
  type: 'User' | 'Organization';
}

export interface GitHubTargets {
  connected: boolean;
  viewer: { id: number; login: string } | null;
  owners: GitHubOwner[];
  canCreatePrivate: boolean | null;
  notes: string[];
}

export interface GitHubPlan {
  action: 'create_repository' | 'push_revision';
  viewer: { id: number; login: string };
  owner: GitHubOwner;
  repository: { name: string; visibility: 'private' | 'public'; branch: string };
  revision: { id: string; number: number; contentSha256: string; fileCount: number };
  warnings: string[];
  costNote: string;
}

export interface GitHubOperation {
  id: string;
  action: 'create_repository' | 'push_revision';
  status: 'prepared' | 'approved' | 'executing' | 'succeeded' | 'failed' | 'ambiguous' | 'diverged' | 'cancelled';
  plan: GitHubPlan;
  planDigest: string;
  approvalExpiresAt: string | null;
  receipt: { repository: { owner: string; name: string; url: string; private: boolean }; commit: { sha: string }; revision: { number: number }; verifiedFileCount: number } | null;
  failure: string | null;
  createdAt: string;
}

export interface GitHubState {
  binding: { repository: { owner: string; name: string; url: string; private: boolean }; lastCommitSha: string; lastRevisionNumber: number; commits: Array<{ revisionNumber: number; commitSha: string }> } | null;
  operations: GitHubOperation[];
}

type Prepared = { operation: GitHubOperation; plan: GitHubPlan; requiresApproval: boolean };

async function download(path: string): Promise<{ blob: Blob; filename: string; sha256: string | null }> {
  const { data } = await createClient().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new BuilderApiError(401, 'UNAUTHORIZED', 'Sign in required.');
  const response = await fetchApiResponse(`${API_URL}/api/builder${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new BuilderApiError(response.status, json.code ?? 'BUILDER_FAILED', json.error ?? 'The download could not be completed.');
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  return { blob: await response.blob(), filename: /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'project.zip', sha256: response.headers.get('x-xroga-archive-sha256') };
}

export const builderPhase2Api = {
  intent: (input: { prompt: string; projectId?: string | null }) => request<{ intent: 'new_product' | 'followup' | 'other'; projectId: string | null }>('/intent', { method: 'POST', body: input }),
  diff: (projectId: string, revisionId: string, against?: string) => request<RevisionDiff>(`/projects/${projectId}/revisions/${revisionId}/diff${against ? `?against=${against}` : ''}`),
  restartPreview: (projectId: string) => request<{ started: boolean; ready: boolean; reason: string; revisionNumber: number }>(`/projects/${projectId}/preview/restart`, { method: 'POST', body: {} }),
  restore: (projectId: string, revisionId: string) => request<{ restoredFrom: number; unchanged: boolean; notice: string }>(`/projects/${projectId}/revisions/${revisionId}/restore`, { method: 'POST', body: {} }),
  runQa: (projectId: string) => request<{ report: QaReport; summary: QaSummary }>(`/projects/${projectId}/qa`, { method: 'POST', body: {} }),
  latestQa: (projectId: string) => request<{ latest: QaSummary | null }>(`/projects/${projectId}/qa?latest=1`),
  qaReport: (projectId: string, verificationId: string) => request<{ verification: { report: QaReport } }>(`/projects/${projectId}/qa/${verificationId}`),
  verifyAndRepair: (projectId: string) => request<RepairResult>(`/projects/${projectId}/verify-and-repair`, { method: 'POST', body: {} }),
  downloadSource: (projectId: string, revisionId?: string) => download(`/projects/${projectId}/export.zip${revisionId ? `?revision=${revisionId}` : ''}`),
  githubTargets: () => request<GitHubTargets>('/github/targets'),
  github: (projectId: string) => request<GitHubState>(`/projects/${projectId}/github`),
  prepareGitHub: (projectId: string, input: { operationKey: string; owner: string; repositoryName: string; visibility: 'private' | 'public' }) =>
    request<Prepared>(`/projects/${projectId}/github/prepare`, { method: 'POST', body: input }),
  prepareGitHubSync: (projectId: string, operationKey: string) => request<Prepared>(`/projects/${projectId}/github/sync/prepare`, { method: 'POST', body: { operationKey } }),
  approveGitHub: (projectId: string, operationId: string, digest: string) =>
    request<{ operation: GitHubOperation }>(`/projects/${projectId}/github/operations/${operationId}/approve`, { method: 'POST', body: { digest } }),
  executeGitHub: (projectId: string, operationId: string) => request<{ operation: GitHubOperation }>(`/projects/${projectId}/github/operations/${operationId}/execute`, { method: 'POST', body: {} }),
  cancelGitHub: (projectId: string, operationId: string) => request<{ operation: GitHubOperation }>(`/projects/${projectId}/github/operations/${operationId}/cancel`, { method: 'POST', body: {} }),
};

export const QA_STATUS_LABEL: Record<QaStatus, string> = {
  passed: 'Passed',
  failed: 'Failed',
  partial: 'Partly tested',
  pending_runtime: 'Not run: no running app',
};

/** A fresh identity for one external operation, so a retry never repeats it. */
export function newOperationKey(prefix: string): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`.slice(0, 128);
}
