'use client';

import { createClient } from '@/lib/supabase/client';
import { API_URL } from '@/lib/api';

/** AI Product Builder: client for /api/builder. Every value shown is what the backend recorded. */

export type BuilderProjectState =
  | 'created'
  | 'specified'
  | 'generating'
  | 'generated'
  | 'verifying'
  | 'verified'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'cancelled';

export type BuilderPreviewLifecycle = 'not_started' | 'starting' | 'ready' | 'degraded' | 'stopped' | 'expired' | 'failed';

export interface BuilderProject {
  id: string;
  title: string;
  productType: string;
  state: BuilderProjectState;
  stateReason: string;
  currentRevisionId: string | null;
  currentRevisionNumber: number;
  conversationId: string | null;
  starter: { starterId: string; starterVersion: string; license: string; selectionReason: string };
  spec: { acceptanceCriteria: string[]; unsupported: string[]; pages: Array<{ path: string; purpose: string }> };
  updatedAt: string;
}

export interface BuilderRevisionSummary {
  id: string;
  revisionNumber: number;
  origin: 'starter' | 'generation' | 'repair' | 'followup' | 'restore';
  runId: string;
  contentSha256: string;
  fileCount: number;
  totalBytes: number;
  verificationStatus: 'unverified' | 'verified' | 'partial' | 'failed';
  createdAt: string;
}

export interface BuilderState {
  project: BuilderProject;
  head: BuilderRevisionSummary | null;
  preview: { lifecycle: BuilderPreviewLifecycle; reason: string };
  timeline: Array<{ step: string; status: 'done' | 'active' | 'pending' | 'blocked' | 'failed'; detail: string }>;
}

export class BuilderApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { data } = await createClient().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new BuilderApiError(401, 'UNAUTHORIZED', 'Sign in required.');
  const response = await fetch(`${API_URL}/api/builder${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string; code?: string } & Record<string, unknown>;
  if (!response.ok) throw new BuilderApiError(response.status, json.code ?? 'BUILDER_FAILED', json.error ?? 'The request could not be completed.');
  return json as unknown as T;
}

export const builderApi = {
  create: (input: { prompt: string; requestKey: string; conversationId?: string | null }) =>
    request<{ project: BuilderProject; created: boolean }>('/projects', { method: 'POST', body: input }),
  list: () => request<{ projects: BuilderProject[] }>('/projects'),
  /** The project a chat conversation is building (null when none), so reopening that chat continues the same project. */
  forConversation: (conversationId: string) => request<{ project: BuilderProject | null }>(`/conversations/${encodeURIComponent(conversationId)}/project`),
  /** Stops the build that is running. Saved before the stop is kept; reports whether anything was running. */
  cancel: (projectId: string) => request<{ cancelled: boolean; state: BuilderState }>(`/projects/${projectId}/cancel`, { method: 'POST', body: {} }),
  state: (projectId: string) => request<BuilderState>(`/projects/${projectId}`),
  revisions: (projectId: string) => request<{ revisions: BuilderRevisionSummary[] }>(`/projects/${projectId}/revisions`),
  files: (projectId: string) =>
    request<{ revisionId: string | null; revisionNumber: number; files: Array<{ path: string; content: string }> }>(`/projects/${projectId}/files`),
};

/** Off until the canonical engine and runtime are activated for this environment. */
export const BUILDER_ENABLED = process.env.NEXT_PUBLIC_XROGA_BUILDER === '1';

export const BUILDER_STATE_LABEL: Record<BuilderProjectState, string> = {
  created: 'Created',
  specified: 'Ready to build',
  generating: 'Building',
  generated: 'Source saved',
  verifying: 'Checking',
  verified: 'Verified',
  partial: 'Partial',
  blocked: 'Blocked',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
