import { randomUUID } from 'node:crypto';

import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import type { BuilderStore } from './store.js';
import {
  BuilderError,
  type ExternalAction,
  type ExternalOperation,
  type ExternalProvider,
  type ExternalOperationStatus,
  type VerificationKind,
  type VerificationRecord,
  type VerificationStatus,
} from './types.js';

export interface SaveVerificationInput {
  readonly revisionId: string;
  readonly runId: string;
  readonly kind: VerificationKind;
  readonly status: VerificationStatus;
  readonly executedChecks: number;
  readonly summary: Record<string, unknown>;
  readonly report: unknown;
}

export interface CreateOperationInput {
  readonly provider: ExternalProvider;
  readonly action: ExternalAction;
  readonly operationKey: string;
  readonly revisionId: string;
  readonly plan: Record<string, unknown>;
  readonly planDigest: string;
}

export interface OperationPatch {
  readonly approvedAt?: string | null;
  readonly approvalExpiresAt?: string | null;
  readonly receipt?: Record<string, unknown> | null;
  readonly failure?: string | null;
}

/** Evidence and external-operation persistence. Every method is owner-scoped and checks the project belongs to the owner. */
export interface Phase2Store {
  saveVerification(userId: string, projectId: string, input: SaveVerificationInput): Promise<{ record: VerificationRecord; replayed: boolean } | null>;
  listVerifications(userId: string, projectId: string, revisionId?: string): Promise<VerificationRecord[]>;
  getVerification(userId: string, projectId: string, id: string): Promise<VerificationRecord | null>;
  createOperation(userId: string, projectId: string, input: CreateOperationInput): Promise<{ operation: ExternalOperation; created: boolean } | null>;
  getOperation(userId: string, projectId: string, id: string): Promise<ExternalOperation | null>;
  listOperations(userId: string, projectId: string): Promise<ExternalOperation[]>;
  /** Compare-and-set: moves the operation only when it is currently in one of `from`. Null when it is not. */
  transitionOperation(userId: string, projectId: string, id: string, from: readonly ExternalOperationStatus[], to: ExternalOperationStatus, patch?: OperationPatch): Promise<ExternalOperation | null>;
}

const clone = <T>(value: T): T => structuredClone(value);
const REPORT_LIMIT_BYTES = 3 * 1024 * 1024;

function assertReportSize(report: unknown): void {
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > REPORT_LIMIT_BYTES) throw new BuilderError('too_large', 'The verification report is too large to store.');
}

function stripReport({ report: _report, ...rest }: VerificationRecord): VerificationRecord {
  return rest;
}

export class InMemoryPhase2Store implements Phase2Store {
  private readonly verifications: VerificationRecord[] = [];
  private readonly operations: ExternalOperation[] = [];

  constructor(private readonly builder: BuilderStore) {}

  private async owns(userId: string, projectId: string, revisionId?: string): Promise<boolean> {
    if (!(await this.builder.getProject(userId, projectId))) return false;
    return revisionId ? Boolean(await this.builder.getRevision(userId, projectId, revisionId)) : true;
  }

  async saveVerification(userId: string, projectId: string, input: SaveVerificationInput) {
    if (!(await this.owns(userId, projectId, input.revisionId))) return null;
    assertReportSize(input.report);
    const existing = this.verifications.find((row) => row.revisionId === input.revisionId && row.runId === input.runId && row.kind === input.kind);
    if (existing) return { record: clone(existing), replayed: true };
    const record: VerificationRecord = {
      id: randomUUID(), projectId, userId, revisionId: input.revisionId, runId: input.runId, kind: input.kind, status: input.status,
      executedChecks: input.executedChecks, summary: clone(input.summary), report: clone(input.report), createdAt: new Date().toISOString(),
    };
    this.verifications.push(record);
    return { record: clone(record), replayed: false };
  }

  async listVerifications(userId: string, projectId: string, revisionId?: string) {
    if (!(await this.owns(userId, projectId))) return [];
    return this.verifications
      .filter((row) => row.userId === userId && row.projectId === projectId && (!revisionId || row.revisionId === revisionId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => stripReport(clone(row)));
  }

  async getVerification(userId: string, projectId: string, id: string) {
    const row = this.verifications.find((candidate) => candidate.id === id && candidate.userId === userId && candidate.projectId === projectId);
    return row ? clone(row) : null;
  }

  async createOperation(userId: string, projectId: string, input: CreateOperationInput) {
    if (!(await this.owns(userId, projectId, input.revisionId))) return null;
    const existing = this.operations.find((row) => row.userId === userId && row.projectId === projectId && row.provider === input.provider && row.action === input.action && row.operationKey === input.operationKey);
    if (existing) {
      if (existing.planDigest !== input.planDigest) throw new BuilderError('conflict', 'This operation key was already used for a different plan.');
      return { operation: clone(existing), created: false };
    }
    const now = new Date().toISOString();
    const operation: ExternalOperation = {
      id: randomUUID(), projectId, userId, provider: input.provider, action: input.action, operationKey: input.operationKey, revisionId: input.revisionId,
      status: 'prepared', plan: clone(input.plan), planDigest: input.planDigest, approvedAt: null, approvalExpiresAt: null, receipt: null, failure: null, createdAt: now, updatedAt: now,
    };
    this.operations.push(operation);
    return { operation: clone(operation), created: true };
  }

  async getOperation(userId: string, projectId: string, id: string) {
    const row = this.operations.find((candidate) => candidate.id === id && candidate.userId === userId && candidate.projectId === projectId);
    return row ? clone(row) : null;
  }

  async listOperations(userId: string, projectId: string) {
    return this.operations.filter((row) => row.userId === userId && row.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }

  async transitionOperation(userId: string, projectId: string, id: string, from: readonly ExternalOperationStatus[], to: ExternalOperationStatus, patch: OperationPatch = {}) {
    const index = this.operations.findIndex((candidate) => candidate.id === id && candidate.userId === userId && candidate.projectId === projectId);
    if (index < 0 || !from.includes(this.operations[index].status)) return null;
    if (to === 'executing' && this.operations.some((row) => row.projectId === projectId && row.provider === this.operations[index].provider && row.status === 'executing')) {
      throw new BuilderError('conflict', 'Another external operation is already running for this project.');
    }
    const current = this.operations[index];
    const next: ExternalOperation = {
      ...current, status: to,
      approvedAt: patch.approvedAt !== undefined ? patch.approvedAt : current.approvedAt,
      approvalExpiresAt: patch.approvalExpiresAt !== undefined ? patch.approvalExpiresAt : current.approvalExpiresAt,
      receipt: patch.receipt !== undefined ? patch.receipt : current.receipt,
      failure: patch.failure !== undefined ? patch.failure : current.failure,
      updatedAt: new Date().toISOString(),
    };
    this.operations[index] = next;
    return clone(next);
  }
}

interface VerificationRow {
  id: string; project_id: string; user_id: string; revision_id: string; run_id: string; kind: VerificationKind; status: VerificationStatus;
  executed_checks: number; summary: Record<string, unknown>; report?: unknown; created_at: string;
}
interface OperationRow {
  id: string; project_id: string; user_id: string; provider: ExternalProvider; action: ExternalAction; operation_key: string; revision_id: string;
  status: ExternalOperationStatus; plan: Record<string, unknown>; plan_digest: string; approved_at: string | null; approval_expires_at: string | null;
  receipt: Record<string, unknown> | null; failure: string | null; created_at: string; updated_at: string;
}

const VERIFICATION_META = 'id,project_id,user_id,revision_id,run_id,kind,status,executed_checks,summary,created_at';
const OPERATION_COLUMNS = 'id,project_id,user_id,provider,action,operation_key,revision_id,status,plan,plan_digest,approved_at,approval_expires_at,receipt,failure,created_at,updated_at';

const toVerification = (row: VerificationRow): VerificationRecord => ({
  id: row.id, projectId: row.project_id, userId: row.user_id, revisionId: row.revision_id, runId: row.run_id, kind: row.kind, status: row.status,
  executedChecks: row.executed_checks, summary: row.summary, ...(row.report !== undefined ? { report: row.report } : {}), createdAt: row.created_at,
});
const toOperation = (row: OperationRow): ExternalOperation => ({
  id: row.id, projectId: row.project_id, userId: row.user_id, provider: row.provider, action: row.action, operationKey: row.operation_key, revisionId: row.revision_id,
  status: row.status, plan: row.plan, planDigest: row.plan_digest, approvedAt: row.approved_at, approvalExpiresAt: row.approval_expires_at, receipt: row.receipt,
  failure: row.failure, createdAt: row.created_at, updatedAt: row.updated_at,
});

function storageFailure(action: string): never {
  throw new BuilderError('storage_failed', `Project storage failed while trying to ${action}. Nothing was reported as saved.`);
}

export class SupabasePhase2Store implements Phase2Store {
  constructor(
    private readonly tenant: TenantContext,
    private readonly builder: BuilderStore,
  ) {
    requireTenantContext(tenant);
  }

  private db() {
    return getTenantSupabaseAdmin(this.tenant);
  }

  private owner(userId: string): string {
    if (userId !== requireTenantContext(this.tenant).userId) throw new BuilderError('not_found', 'Project not found.');
    return userId;
  }

  private async owns(userId: string, projectId: string, revisionId?: string): Promise<boolean> {
    if (!(await this.builder.getProject(userId, projectId))) return false;
    return revisionId ? Boolean(await this.builder.getRevision(userId, projectId, revisionId)) : true;
  }

  async saveVerification(userId: string, projectId: string, input: SaveVerificationInput) {
    const owner = this.owner(userId);
    if (!(await this.owns(owner, projectId, input.revisionId))) return null;
    assertReportSize(input.report);
    const inserted = await this.db().from('builder_verifications').insert({
      project_id: projectId, user_id: owner, revision_id: input.revisionId, run_id: input.runId, kind: input.kind, status: input.status,
      executed_checks: input.executedChecks, summary: input.summary, report: input.report,
    }).select(`${VERIFICATION_META},report`).single();
    if (!inserted.error) return { record: toVerification(inserted.data as VerificationRow), replayed: false };
    // Unique (revision, run, kind): a retry of the same run resolves to the stored record.
    const existing = await this.db().from('builder_verifications').select(`${VERIFICATION_META},report`).eq('user_id', owner).eq('project_id', projectId).eq('revision_id', input.revisionId).eq('run_id', input.runId).eq('kind', input.kind).maybeSingle();
    if (!existing.error && existing.data) return { record: toVerification(existing.data as VerificationRow), replayed: true };
    return storageFailure('save the verification');
  }

  async listVerifications(userId: string, projectId: string, revisionId?: string) {
    const owner = this.owner(userId);
    let query = this.db().from('builder_verifications').select(VERIFICATION_META).eq('user_id', owner).eq('project_id', projectId).order('created_at', { ascending: false }).limit(100);
    if (revisionId) query = query.eq('revision_id', revisionId);
    const { data, error } = await query;
    if (error) return storageFailure('list verifications');
    return ((data ?? []) as VerificationRow[]).map(toVerification);
  }

  async getVerification(userId: string, projectId: string, id: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('builder_verifications').select(`${VERIFICATION_META},report`).eq('user_id', owner).eq('project_id', projectId).eq('id', id).maybeSingle();
    if (error) return storageFailure('read the verification');
    return data ? toVerification(data as VerificationRow) : null;
  }

  async createOperation(userId: string, projectId: string, input: CreateOperationInput) {
    const owner = this.owner(userId);
    if (!(await this.owns(owner, projectId, input.revisionId))) return null;
    const find = () => this.db().from('builder_external_operations').select(OPERATION_COLUMNS).eq('user_id', owner).eq('project_id', projectId).eq('provider', input.provider).eq('action', input.action).eq('operation_key', input.operationKey).maybeSingle();
    const resolveExisting = (row: OperationRow) => {
      if (row.plan_digest !== input.planDigest) throw new BuilderError('conflict', 'This operation key was already used for a different plan.');
      return { operation: toOperation(row), created: false };
    };
    const existing = await find();
    if (existing.error) return storageFailure('read the operation');
    if (existing.data) return resolveExisting(existing.data as OperationRow);
    const inserted = await this.db().from('builder_external_operations').insert({
      project_id: projectId, user_id: owner, provider: input.provider, action: input.action, operation_key: input.operationKey, revision_id: input.revisionId,
      plan: input.plan, plan_digest: input.planDigest,
    }).select(OPERATION_COLUMNS).single();
    if (!inserted.error) return { operation: toOperation(inserted.data as OperationRow), created: true };
    const raced = await find();
    if (!raced.error && raced.data) return resolveExisting(raced.data as OperationRow);
    return storageFailure('record the operation');
  }

  async getOperation(userId: string, projectId: string, id: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('builder_external_operations').select(OPERATION_COLUMNS).eq('user_id', owner).eq('project_id', projectId).eq('id', id).maybeSingle();
    if (error) return storageFailure('read the operation');
    return data ? toOperation(data as OperationRow) : null;
  }

  async listOperations(userId: string, projectId: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('builder_external_operations').select(OPERATION_COLUMNS).eq('user_id', owner).eq('project_id', projectId).order('created_at', { ascending: false }).limit(100);
    if (error) return storageFailure('list operations');
    return ((data ?? []) as OperationRow[]).map(toOperation);
  }

  async transitionOperation(userId: string, projectId: string, id: string, from: readonly ExternalOperationStatus[], to: ExternalOperationStatus, patch: OperationPatch = {}) {
    const owner = this.owner(userId);
    const update: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
    if (patch.approvedAt !== undefined) update.approved_at = patch.approvedAt;
    if (patch.approvalExpiresAt !== undefined) update.approval_expires_at = patch.approvalExpiresAt;
    if (patch.receipt !== undefined) update.receipt = patch.receipt;
    if (patch.failure !== undefined) update.failure = patch.failure;
    // The status predicate makes this a database-arbitrated compare-and-set.
    const { data, error } = await this.db().from('builder_external_operations').update(update).eq('user_id', owner).eq('project_id', projectId).eq('id', id).in('status', [...from]).select(OPERATION_COLUMNS).maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === '23505') throw new BuilderError('conflict', 'Another external operation is already running for this project.');
      return storageFailure('update the operation');
    }
    return data ? toOperation(data as OperationRow) : null;
  }
}
