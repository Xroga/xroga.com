import { randomUUID } from 'node:crypto';

import type { ProjectFile } from '../ai/patches.js';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import {
  assertSnapshotAcceptable,
  diffSnapshots,
  hashSnapshot,
  snapshotBytes,
} from './snapshot.js';
import {
  BuilderError,
  type BuildSpec,
  type BuilderProject,
  type BuilderProjectState,
  type BuilderRevision,
  type ChangeSummary,
  type RevisionOrigin,
  type RevisionVerification,
  type StarterProvenance,
} from './types.js';

export interface CreateProjectInput {
  readonly requestKey: string;
  readonly title: string;
  readonly spec: BuildSpec;
  readonly starter: StarterProvenance;
  readonly conversationId?: string | null;
}

export interface AppendRevisionInput {
  readonly runId: string;
  readonly origin: RevisionOrigin;
  readonly files: readonly ProjectFile[];
  /** The head revision the caller built on. A stale parent is a conflict, never an overwrite. */
  readonly expectedParentId: string | null;
}

export type AppendRevisionResult =
  | { readonly kind: 'created' | 'replayed'; readonly revision: BuilderRevision }
  | { readonly kind: 'conflict'; readonly currentRevisionId: string | null };

/**
 * Owner-scoped persistence. Every method takes the verified owner as its first argument and
 * returns "not found" (null) for another tenant's rows. A client-supplied project id never
 * establishes ownership.
 */
export interface BuilderStore {
  createProject(userId: string, input: CreateProjectInput): Promise<{ project: BuilderProject; created: boolean }>;
  getProject(userId: string, projectId: string): Promise<BuilderProject | null>;
  listProjects(userId: string, limit?: number): Promise<BuilderProject[]>;
  setState(userId: string, projectId: string, state: BuilderProjectState, reason: string, activeRunId?: string | null): Promise<BuilderProject | null>;
  /**
   * Records a state only while no build holds the project's run slot (compare-and-set on the slot). QA and repair use it so a
   * late test result can never overwrite a newer build's state or release its slot. Null when the project is busy or not found.
   */
  setStateIfIdle(userId: string, projectId: string, state: BuilderProjectState, reason: string): Promise<BuilderProject | null>;
  /**
   * Records a state only while `runId` still holds the project's run slot (compare-and-set on the slot), then sets the slot to
   * `nextActiveRunId`. A run that was cancelled, or replaced after going stale, can therefore never overwrite the state of the run
   * that superseded it. Null when the run no longer holds the slot or the project is not found.
   */
  setStateForRun(userId: string, projectId: string, runId: string, state: BuilderProjectState, reason: string, nextActiveRunId: string | null): Promise<BuilderProject | null>;
  /**
   * Cancels the build holding the run slot: one compare-and-set that records `cancelled` and releases the slot. Reports `idle` (and
   * changes nothing) when no build holds it, and null when the project is not found.
   */
  cancelRun(userId: string, projectId: string, reason: string): Promise<{ kind: 'cancelled'; project: BuilderProject; runId: string } | { kind: 'idle'; project: BuilderProject } | null>;
  /** Records the strict readiness result for a revision of the preview ('ready' | 'failed'), or clears it. */
  markPreviewReadiness(userId: string, projectId: string, result: { revisionId: string; ready: boolean } | null): Promise<void>;
  /**
   * Atomically takes the single build slot. Succeeds when no build is active, the active build is
   * this same run, or the active build has not been touched since `staleBefore` (a crashed run).
   * Two simultaneous callers can never both claim it.
   */
  claimRun(userId: string, projectId: string, runId: string, staleBefore: Date): Promise<{ kind: 'claimed'; project: BuilderProject } | { kind: 'busy' } | null>;
  appendRevision(userId: string, projectId: string, input: AppendRevisionInput): Promise<AppendRevisionResult | null>;
  getRevision(userId: string, projectId: string, revisionId: string): Promise<BuilderRevision | null>;
  listRevisions(userId: string, projectId: string): Promise<Array<Omit<BuilderRevision, 'files'>>>;
  setRevisionVerification(userId: string, projectId: string, revisionId: string, status: RevisionVerification): Promise<boolean>;
}

export const REQUEST_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;

export function assertRequestKey(key: string): void {
  if (!REQUEST_KEY.test(key)) throw new BuilderError('invalid_input', 'A request key of 8 to 128 safe characters is required for idempotent creation.');
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Behaviourally identical to the Supabase store; used for local tests and fixtures only. */
export class InMemoryBuilderStore implements BuilderStore {
  private readonly projects = new Map<string, BuilderProject>();
  private readonly revisions = new Map<string, BuilderRevision>();

  async createProject(userId: string, input: CreateProjectInput) {
    assertRequestKey(input.requestKey);
    for (const project of this.projects.values()) {
      if (project.userId === userId && project.requestKey === input.requestKey) return { project: clone(project), created: false };
    }
    const now = new Date().toISOString();
    const project: BuilderProject = {
      id: randomUUID(),
      userId,
      requestKey: input.requestKey,
      title: input.title,
      productType: input.spec.productType,
      state: 'created',
      stateReason: 'Project created.',
      previewReadiness: null,
      spec: clone(input.spec),
      starter: clone(input.starter),
      conversationId: input.conversationId ?? null,
      activeRunId: null,
      currentRevisionId: null,
      currentRevisionNumber: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(project.id, project);
    return { project: clone(project), created: true };
  }

  async getProject(userId: string, projectId: string) {
    const project = this.projects.get(projectId);
    return project && project.userId === userId ? clone(project) : null;
  }

  async listProjects(userId: string, limit = 50) {
    return [...this.projects.values()]
      .filter((project) => project.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(clone);
  }

  async setState(userId: string, projectId: string, state: BuilderProjectState, reason: string, activeRunId?: string | null) {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) return null;
    const next: BuilderProject = {
      ...project,
      state,
      stateReason: reason.slice(0, 500),
      activeRunId: activeRunId === undefined ? project.activeRunId : activeRunId,
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(projectId, next);
    return clone(next);
  }

  async setStateIfIdle(userId: string, projectId: string, state: BuilderProjectState, reason: string) {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId || project.activeRunId !== null) return null;
    return this.setState(userId, projectId, state, reason);
  }

  async setStateForRun(userId: string, projectId: string, runId: string, state: BuilderProjectState, reason: string, nextActiveRunId: string | null) {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId || project.activeRunId !== runId) return null;
    return this.setState(userId, projectId, state, reason, nextActiveRunId);
  }

  async cancelRun(userId: string, projectId: string, reason: string) {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) return null;
    const active = (project.state === 'generating' || project.state === 'verifying') ? project.activeRunId : null;
    if (active === null) return { kind: 'idle' as const, project: clone(project) };
    const next = await this.setState(userId, projectId, 'cancelled', reason, null);
    return { kind: 'cancelled' as const, project: next!, runId: active };
  }

  async markPreviewReadiness(userId: string, projectId: string, result: { revisionId: string; ready: boolean } | null) {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) return;
    this.projects.set(projectId, { ...project, previewReadiness: result ? `${result.revisionId}:${result.ready ? 'ready' : 'failed'}` : null });
  }

  async claimRun(userId: string, projectId: string, runId: string, staleBefore: Date) {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) return null;
    const active = (project.state === 'generating' || project.state === 'verifying') && project.activeRunId !== null;
    if (active && project.activeRunId !== runId && project.updatedAt >= staleBefore.toISOString()) return { kind: 'busy' as const };
    const next: BuilderProject = { ...project, state: 'generating', stateReason: 'Xroga is building the application.', activeRunId: runId, updatedAt: new Date().toISOString() };
    this.projects.set(projectId, next);
    return { kind: 'claimed' as const, project: clone(next) };
  }

  async appendRevision(userId: string, projectId: string, input: AppendRevisionInput): Promise<AppendRevisionResult | null> {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) return null;
    assertSnapshotAcceptable(input.files);
    const contentSha256 = hashSnapshot(input.files);
    for (const revision of this.revisions.values()) {
      if (revision.projectId === projectId && revision.runId === input.runId && revision.contentSha256 === contentSha256) {
        return { kind: 'replayed', revision: clone(revision) };
      }
    }
    if (input.expectedParentId !== project.currentRevisionId) {
      return { kind: 'conflict', currentRevisionId: project.currentRevisionId };
    }
    const parent = project.currentRevisionId ? this.revisions.get(project.currentRevisionId) : undefined;
    const changeSummary: ChangeSummary = diffSnapshots(parent?.files ?? [], input.files);
    const revision: BuilderRevision = {
      id: randomUUID(),
      projectId,
      userId,
      revisionNumber: project.currentRevisionNumber + 1,
      parentRevisionId: project.currentRevisionId,
      runId: input.runId,
      origin: input.origin,
      contentSha256,
      fileCount: input.files.length,
      totalBytes: snapshotBytes(input.files),
      files: input.files.map((file) => ({ path: file.path, content: file.content })),
      changeSummary,
      verificationStatus: 'unverified',
      createdAt: new Date().toISOString(),
    };
    this.revisions.set(revision.id, revision);
    this.projects.set(projectId, {
      ...project,
      currentRevisionId: revision.id,
      currentRevisionNumber: revision.revisionNumber,
      updatedAt: revision.createdAt,
    });
    return { kind: 'created', revision: clone(revision) };
  }

  async getRevision(userId: string, projectId: string, revisionId: string) {
    const revision = this.revisions.get(revisionId);
    return revision && revision.userId === userId && revision.projectId === projectId ? clone(revision) : null;
  }

  async listRevisions(userId: string, projectId: string) {
    return [...this.revisions.values()]
      .filter((revision) => revision.userId === userId && revision.projectId === projectId)
      .sort((a, b) => b.revisionNumber - a.revisionNumber)
      .map(({ files: _files, ...rest }) => clone(rest));
  }

  async setRevisionVerification(userId: string, projectId: string, revisionId: string, status: RevisionVerification) {
    const revision = this.revisions.get(revisionId);
    if (!revision || revision.userId !== userId || revision.projectId !== projectId) return false;
    this.revisions.set(revisionId, { ...revision, verificationStatus: status });
    return true;
  }
}

interface ProjectRow {
  id: string; user_id: string; request_key: string; title: string; product_type: string; state: BuilderProjectState;
  state_reason: string; spec: BuildSpec; starter: StarterProvenance; conversation_id: string | null; active_run_id: string | null;
  current_revision_id: string | null; current_revision_number: number; preview_readiness: string | null; created_at: string; updated_at: string;
}

interface RevisionRow {
  id: string; project_id: string; user_id: string; revision_number: number; parent_revision_id: string | null; run_id: string;
  origin: RevisionOrigin; content_sha256: string; file_count: number; total_bytes: number | string; files?: ProjectFile[];
  change_summary: ChangeSummary; verification_status: RevisionVerification; created_at: string;
}

const PROJECT_COLUMNS =
  'id,user_id,request_key,title,product_type,state,state_reason,spec,starter,conversation_id,active_run_id,current_revision_id,current_revision_number,preview_readiness,created_at,updated_at';
const REVISION_META_COLUMNS =
  'id,project_id,user_id,revision_number,parent_revision_id,run_id,origin,content_sha256,file_count,total_bytes,change_summary,verification_status,created_at';

function toProject(row: ProjectRow): BuilderProject {
  return {
    id: row.id, userId: row.user_id, requestKey: row.request_key, title: row.title, productType: row.product_type,
    state: row.state, stateReason: row.state_reason, spec: row.spec, starter: row.starter, conversationId: row.conversation_id,
    activeRunId: row.active_run_id, currentRevisionId: row.current_revision_id, currentRevisionNumber: row.current_revision_number,
    previewReadiness: row.preview_readiness ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function toRevision(row: RevisionRow): BuilderRevision {
  return {
    id: row.id, projectId: row.project_id, userId: row.user_id, revisionNumber: row.revision_number,
    parentRevisionId: row.parent_revision_id, runId: row.run_id, origin: row.origin, contentSha256: row.content_sha256,
    fileCount: row.file_count, totalBytes: Number(row.total_bytes), files: row.files ?? [], changeSummary: row.change_summary,
    verificationStatus: row.verification_status, createdAt: row.created_at,
  };
}

function storageFailure(action: string, error: { message?: string } | null): never {
  // The database message can contain row data; callers only see a fixed, safe description.
  void error;
  throw new BuilderError('storage_failed', `Project storage failed while trying to ${action}. Nothing was reported as saved.`);
}

export class SupabaseBuilderStore implements BuilderStore {
  constructor(private readonly tenant: TenantContext) {
    requireTenantContext(tenant);
  }

  private db() {
    return getTenantSupabaseAdmin(this.tenant);
  }

  private owner(userId: string): string {
    // The verified issued context is the only authority; a mismatching argument is a programming error.
    if (userId !== requireTenantContext(this.tenant).userId) throw new BuilderError('not_found', 'Project not found.');
    return userId;
  }

  async createProject(userId: string, input: CreateProjectInput) {
    const owner = this.owner(userId);
    assertRequestKey(input.requestKey);
    const existing = await this.db().from('builder_projects').select(PROJECT_COLUMNS).eq('user_id', owner).eq('request_key', input.requestKey).maybeSingle();
    if (existing.error) storageFailure('read the project', existing.error);
    if (existing.data) return { project: toProject(existing.data as ProjectRow), created: false };
    const inserted = await this.db().from('builder_projects').insert({
      user_id: owner, request_key: input.requestKey, title: input.title, product_type: input.spec.productType,
      spec: input.spec, starter: input.starter, conversation_id: input.conversationId ?? null,
    }).select(PROJECT_COLUMNS).single();
    if (inserted.error) {
      // A concurrent identical request can win the unique (user_id, request_key) race: resolve to it.
      const raced = await this.db().from('builder_projects').select(PROJECT_COLUMNS).eq('user_id', owner).eq('request_key', input.requestKey).maybeSingle();
      if (!raced.error && raced.data) return { project: toProject(raced.data as ProjectRow), created: false };
      storageFailure('create the project', inserted.error);
    }
    return { project: toProject(inserted.data as ProjectRow), created: true };
  }

  async getProject(userId: string, projectId: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('builder_projects').select(PROJECT_COLUMNS).eq('user_id', owner).eq('id', projectId).maybeSingle();
    if (error) storageFailure('read the project', error);
    return data ? toProject(data as ProjectRow) : null;
  }

  async listProjects(userId: string, limit = 50) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('builder_projects').select(PROJECT_COLUMNS).eq('user_id', owner).order('updated_at', { ascending: false }).limit(limit);
    if (error) storageFailure('list projects', error);
    return ((data ?? []) as ProjectRow[]).map(toProject);
  }

  async setState(userId: string, projectId: string, state: BuilderProjectState, reason: string, activeRunId?: string | null) {
    const owner = this.owner(userId);
    const patch: Record<string, unknown> = { state, state_reason: reason.slice(0, 500), updated_at: new Date().toISOString() };
    if (activeRunId !== undefined) patch.active_run_id = activeRunId;
    const { data, error } = await this.db().from('builder_projects').update(patch).eq('user_id', owner).eq('id', projectId).select(PROJECT_COLUMNS).maybeSingle();
    if (error) storageFailure('update the project state', error);
    return data ? toProject(data as ProjectRow) : null;
  }

  async setStateIfIdle(userId: string, projectId: string, state: BuilderProjectState, reason: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db()
      .from('builder_projects')
      .update({ state, state_reason: reason.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('user_id', owner)
      .eq('id', projectId)
      .is('active_run_id', null)
      .select(PROJECT_COLUMNS)
      .maybeSingle();
    if (error) storageFailure('update the project state', error);
    return data ? toProject(data as ProjectRow) : null;
  }

  async setStateForRun(userId: string, projectId: string, runId: string, state: BuilderProjectState, reason: string, nextActiveRunId: string | null) {
    const owner = this.owner(userId);
    const { data, error } = await this.db()
      .from('builder_projects')
      .update({ state, state_reason: reason.slice(0, 500), active_run_id: nextActiveRunId, updated_at: new Date().toISOString() })
      .eq('user_id', owner)
      .eq('id', projectId)
      .eq('active_run_id', runId)
      .select(PROJECT_COLUMNS)
      .maybeSingle();
    if (error) storageFailure('update the project state', error);
    return data ? toProject(data as ProjectRow) : null;
  }

  async cancelRun(userId: string, projectId: string, reason: string) {
    const owner = this.owner(userId);
    const current = await this.getProject(owner, projectId);
    if (!current) return null;
    const active = (current.state === 'generating' || current.state === 'verifying') ? current.activeRunId : null;
    if (active === null) return { kind: 'idle' as const, project: current };
    // One conditional UPDATE naming the run we read: if the build finished or was replaced in between, nothing changes.
    const { data, error } = await this.db()
      .from('builder_projects')
      .update({ state: 'cancelled', state_reason: reason.slice(0, 500), active_run_id: null, updated_at: new Date().toISOString() })
      .eq('user_id', owner)
      .eq('id', projectId)
      .eq('active_run_id', active)
      .in('state', ['generating', 'verifying'])
      .select(PROJECT_COLUMNS)
      .maybeSingle();
    if (error) storageFailure('cancel the build', error);
    if (data) return { kind: 'cancelled' as const, project: toProject(data as ProjectRow), runId: active };
    const after = await this.getProject(owner, projectId);
    return after ? { kind: 'idle' as const, project: after } : null;
  }

  async markPreviewReadiness(userId: string, projectId: string, result: { revisionId: string; ready: boolean } | null) {
    const owner = this.owner(userId);
    const { error } = await this.db().from('builder_projects').update({ preview_readiness: result ? `${result.revisionId}:${result.ready ? 'ready' : 'failed'}` : null }).eq('user_id', owner).eq('id', projectId);
    if (error) storageFailure('record the preview check', error);
  }

  async claimRun(userId: string, projectId: string, runId: string, staleBefore: Date) {
    const owner = this.owner(userId);
    if (!/^[A-Za-z0-9-]{8,64}$/.test(runId)) throw new BuilderError('invalid_input', 'Invalid run identity.');
    const now = new Date().toISOString();
    // One conditional UPDATE: the database arbitrates, so concurrent claimers cannot both win.
    const claimed = await this.db()
      .from('builder_projects')
      .update({ state: 'generating', state_reason: 'Xroga is building the application.', active_run_id: runId, updated_at: now })
      .eq('user_id', owner)
      .eq('id', projectId)
      .or(`active_run_id.is.null,active_run_id.eq.${runId},state.not.in.(generating,verifying),updated_at.lt.${staleBefore.toISOString()}`)
      .select(PROJECT_COLUMNS)
      .maybeSingle();
    if (claimed.error) storageFailure('start the build', claimed.error);
    if (claimed.data) return { kind: 'claimed' as const, project: toProject(claimed.data as ProjectRow) };
    return (await this.getProject(owner, projectId)) ? { kind: 'busy' as const } : null;
  }

  async appendRevision(userId: string, projectId: string, input: AppendRevisionInput): Promise<AppendRevisionResult | null> {
    const owner = this.owner(userId);
    assertSnapshotAcceptable(input.files);
    const parent = input.expectedParentId ? await this.getRevision(owner, projectId, input.expectedParentId) : null;
    const contentSha256 = hashSnapshot(input.files);
    const changeSummary = diffSnapshots(parent?.files ?? [], input.files);
    const { data, error } = await this.db().rpc('append_builder_revision', {
      p_project_id: projectId, p_user_id: owner, p_run_id: input.runId, p_origin: input.origin, p_content_sha256: contentSha256,
      p_file_count: input.files.length, p_total_bytes: snapshotBytes(input.files),
      p_files: input.files.map((file) => ({ path: file.path, content: file.content })), p_change_summary: changeSummary,
      p_expected_parent: input.expectedParentId,
    });
    if (error) storageFailure('save the source revision', error);
    if (data === null || data === undefined) return null;
    const result = data as { revision_id?: string; replayed?: boolean; conflict?: boolean; current_revision_id?: string | null };
    if (result.conflict) return { kind: 'conflict', currentRevisionId: result.current_revision_id ?? null };
    if (!result.revision_id) storageFailure('save the source revision', null);
    // Read back what was stored: "saved" is only reported for a revision that is actually readable and hash-equal.
    const stored = await this.getRevision(owner, projectId, result.revision_id as string);
    if (!stored || stored.contentSha256 !== contentSha256 || hashSnapshot(stored.files) !== contentSha256) {
      storageFailure('verify the saved source revision', null);
    }
    return { kind: result.replayed ? 'replayed' : 'created', revision: stored as BuilderRevision };
  }

  async getRevision(userId: string, projectId: string, revisionId: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('builder_revisions').select(`${REVISION_META_COLUMNS},files`).eq('user_id', owner).eq('project_id', projectId).eq('id', revisionId).maybeSingle();
    if (error) storageFailure('read the source revision', error);
    return data ? toRevision(data as RevisionRow) : null;
  }

  async listRevisions(userId: string, projectId: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('builder_revisions').select(REVISION_META_COLUMNS).eq('user_id', owner).eq('project_id', projectId).order('revision_number', { ascending: false }).limit(200);
    if (error) storageFailure('list source revisions', error);
    return ((data ?? []) as RevisionRow[]).map((row) => {
      const { files: _files, ...rest } = toRevision(row);
      return rest;
    });
  }

  async setRevisionVerification(userId: string, projectId: string, revisionId: string, status: RevisionVerification) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('builder_revisions').update({ verification_status: status }).eq('user_id', owner).eq('project_id', projectId).eq('id', revisionId).select('id').maybeSingle();
    if (error) storageFailure('record revision verification', error);
    return Boolean(data);
  }
}
