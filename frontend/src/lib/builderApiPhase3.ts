'use client';

import { request } from '@/lib/builderApi';

/** AI Product Builder Phase 3 client: customer-owned Supabase and Vercel, and delivery provenance. */

export type OperationStatus = 'prepared' | 'approved' | 'executing' | 'succeeded' | 'failed' | 'ambiguous' | 'diverged' | 'cancelled';

export interface ExternalOperationView<Plan> {
  id: string;
  action: string;
  status: OperationStatus;
  plan: Plan;
  planDigest: string;
  approvalExpiresAt: string | null;
  receipt: Record<string, any> | null;
  failure: string | null;
  createdAt: string;
}

export interface SupabaseProjectSummary {
  ref: string;
  name: string;
  organizationId: string | null;
  region: string | null;
}

export interface SupabaseTargets {
  connected: boolean;
  projects: SupabaseProjectSummary[];
  notes: string[];
}

export interface SupabaseBindPlan {
  project: SupabaseProjectSummary;
  publicUrl: string;
  notes: string[];
}

export interface SupabaseMigrationPlan {
  projectRef: string;
  projectName: string;
  archetype: string;
  fileName: string;
  sql: string;
  sqlDigest: string;
  risk: 'safe' | 'review' | 'destructive';
  findings: Array<{ level: string; message: string }>;
  createsTables: string[];
  protections: string[];
  warnings: string[];
}

export interface SupabaseState {
  binding: { projectRef: string; projectName: string; url: string; existingTables: string[] } | null;
  schema: { archetype: string; tables: string[]; protections: string[] } | null;
  operations: Array<ExternalOperationView<SupabaseBindPlan | SupabaseMigrationPlan>>;
}

export interface VercelScope {
  kind: 'personal' | 'team';
  id: string | null;
  slug: string;
  name: string;
}

export interface VercelTargets {
  connected: boolean;
  viewer: { id: string; username: string } | null;
  scopes: VercelScope[];
  notes: string[];
}

export interface VercelPreviewPlan {
  scope: VercelScope;
  project: { name: string; mode: 'create' | 'existing' };
  revision: { id: string; number: number; fileCount: number };
  environmentNames: string[];
  behaviour: string[];
  warnings: string[];
  costNote: string;
}

export interface VercelPromotionPlan {
  scope: VercelScope;
  projectName: string;
  revision: { id: string; number: number };
  previewUrl: string;
  productionUrl: string;
  remoteTests: { status: string; executedChecks: number; failedChecks: number; reason: string };
  confirmationPhrase: string;
  warnings: string[];
  costNote: string;
}

export interface VercelState {
  state: { latestPreview: ExternalOperationView<VercelPreviewPlan> | null; latestProduction: ExternalOperationView<VercelPromotionPlan> | null };
  operations: Array<ExternalOperationView<VercelPreviewPlan | VercelPromotionPlan>>;
}

export type DeliveryLevel = 'RECORDED' | 'PENDING' | 'FAILED' | 'NOT_ATTEMPTED';

export interface DeliveryStep {
  level: DeliveryLevel;
  operationId: string | null;
  detail: string;
  link: string | null;
}

export interface RevisionDelivery {
  revisionId: string;
  revisionNumber: number | null;
  github: DeliveryStep;
  supabase: DeliveryStep;
  vercelPreview: DeliveryStep;
  remoteTests: DeliveryStep;
  production: DeliveryStep;
}

type Prepared<Plan> = { operation: ExternalOperationView<Plan>; plan: Plan; created: boolean };
type Executed<Plan> = { operation: ExternalOperationView<Plan> };

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body });

export const builderPhase3Api = {
  delivery: (projectId: string) => request<{ revisions: RevisionDelivery[] }>(`/projects/${projectId}/delivery`),

  supabaseTargets: () => request<SupabaseTargets>('/supabase/projects'),
  supabase: (projectId: string) => request<SupabaseState>(`/projects/${projectId}/supabase`),
  prepareBind: (projectId: string, input: { operationKey: string; projectRef: string }) => post<Prepared<SupabaseBindPlan>>(`/projects/${projectId}/supabase/bind/prepare`, input),
  prepareMigration: (projectId: string, operationKey: string) => post<Prepared<SupabaseMigrationPlan>>(`/projects/${projectId}/supabase/migration/prepare`, { operationKey }),
  approveSupabase: (projectId: string, operationId: string, digest: string) => post<Executed<unknown>>(`/projects/${projectId}/supabase/operations/${operationId}/approve`, { digest }),
  executeBind: (projectId: string, operationId: string) => post<Executed<SupabaseBindPlan>>(`/projects/${projectId}/supabase/operations/${operationId}/execute-bind`),
  executeMigration: (projectId: string, operationId: string) => post<Executed<SupabaseMigrationPlan>>(`/projects/${projectId}/supabase/operations/${operationId}/execute-migration`),
  cancelSupabase: (projectId: string, operationId: string) => post<Executed<unknown>>(`/projects/${projectId}/supabase/operations/${operationId}/cancel`),

  vercelTargets: () => request<VercelTargets>('/vercel/targets'),
  vercel: (projectId: string) => request<VercelState>(`/projects/${projectId}/vercel`),
  preparePreview: (projectId: string, input: { operationKey: string; scopeId: string | null; projectName?: string }) => post<Prepared<VercelPreviewPlan>>(`/projects/${projectId}/vercel/preview/prepare`, input),
  approveVercel: (projectId: string, operationId: string, digest: string) => post<Executed<unknown>>(`/projects/${projectId}/vercel/operations/${operationId}/approve`, { digest }),
  executePreview: (projectId: string, operationId: string) => post<Executed<VercelPreviewPlan>>(`/projects/${projectId}/vercel/operations/${operationId}/execute-preview`),
  cancelVercel: (projectId: string, operationId: string) => post<Executed<unknown>>(`/projects/${projectId}/vercel/operations/${operationId}/cancel`),
  prepareProduction: (projectId: string, input: { operationKey: string; previewOperationId: string }) => post<Prepared<VercelPromotionPlan>>(`/projects/${projectId}/vercel/production/prepare`, input),
  approveProduction: (projectId: string, operationId: string, input: { digest: string; confirmation: string }) => post<Executed<unknown>>(`/projects/${projectId}/vercel/production/${operationId}/approve`, input),
  executeProduction: (projectId: string, operationId: string) => post<Executed<VercelPromotionPlan>>(`/projects/${projectId}/vercel/production/${operationId}/execute`),
};

export const DELIVERY_LEVEL_LABEL: Record<DeliveryLevel, string> = {
  RECORDED: 'Done and verified',
  PENDING: 'In progress',
  FAILED: 'Did not complete',
  NOT_ATTEMPTED: 'Not done',
};

/** Production needs the exact phrase typed back; this mirrors the server check for a disabled button only. */
export const confirmationMatches = (typed: string, phrase: string): boolean => typed.trim() === phrase;
