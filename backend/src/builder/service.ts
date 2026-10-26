import { randomUUID } from 'node:crypto';

import type { ProjectFile } from '../ai/patches.js';
import type { SoftwareRunEvent } from '../ai/softwareAgent/runEvents.js';
import type { CommitFn } from '../synthesis/productionAdapters.js';
import type { UniversalBuildOutcome } from '../synthesis/universalEntrypoint.js';
import { deriveBuildSpec } from './spec.js';
import { hashSnapshot } from './snapshot.js';
import { derivePreviewLifecycle, type PreviewFacts, type PreviewLifecycleView } from './previewLifecycle.js';
import { materializeStarter, selectStarter } from './starters.js';
import { assertRequestKey, type AppendRevisionResult, type BuilderStore } from './store.js';
import {
  BuilderError,
  type BuilderProject,
  type BuilderProjectState,
  type BuilderRevision,
  type RevisionOrigin,
} from './types.js';

export interface BuildRunnerInput {
  readonly userId: string;
  readonly runId: string;
  readonly projectId: string;
  readonly prompt: string;
  readonly existingFiles: readonly ProjectFile[];
  readonly commit: CommitFn;
  readonly onEvent?: (event: SoftwareRunEvent) => void;
  readonly signal?: AbortSignal;
}

/** Runs the canonical engineering path (tryUniversalBuild, SoftwareAgent/Cline). Null means it is not enabled. */
export type BuildRunner = (input: BuildRunnerInput) => Promise<UniversalBuildOutcome | null>;

export interface PreviewLaunchResult {
  readonly started: boolean;
  /** Strict readiness result for the revision that was started, null when it could not be checked. */
  readonly strictReady: boolean | null;
  readonly reason: string;
}

/** Connects a saved revision to the existing live-preview coordinator and runtime. */
export interface PreviewPort {
  /** Starts (or refreshes) the preview for a revision, then verifies readiness strictly. */
  launch(input: {
    readonly userId: string;
    readonly project: BuilderProject;
    readonly revision: BuilderRevision;
    readonly outcome: UniversalBuildOutcome | null;
    readonly runId: string;
    readonly onEvent?: (event: SoftwareRunEvent) => void;
  }): Promise<PreviewLaunchResult>;
  /** Strict readiness of an already-running preview (started by the canonical pipeline). */
  verify(input: { readonly userId: string; readonly projectId: string; readonly revision: BuilderRevision }): Promise<PreviewLaunchResult>;
  facts(userId: string, projectId: string): Promise<Omit<PreviewFacts, 'stale'> & { readonly workspaceSha256: string | null }>;
}

export interface BuilderRunBinding {
  readonly projectId: string;
  readonly runId: string;
  readonly origin: RevisionOrigin;
  readonly parentRevisionId: string | null;
  /** Complete current source the canonical build starts from. */
  readonly files: readonly ProjectFile[];
  readonly commit: CommitFn;
  readonly project: BuilderProject;
  /** The revision this run saved, or null when nothing was committed. */
  readonly saved: () => BuilderRevision | null;
  /** True when the run committed source identical to the current revision, so no revision was created. */
  readonly noChange: () => boolean;
}

export interface BuilderDeps {
  readonly store: BuilderStore;
  readonly runBuild: BuildRunner;
  readonly preview?: PreviewPort;
}

export interface BuilderState {
  readonly project: BuilderProject;
  readonly head: Omit<BuilderRevision, 'files'> | null;
  readonly preview: PreviewLifecycleView;
  readonly timeline: ReadonlyArray<{ step: string; status: 'done' | 'active' | 'pending' | 'blocked' | 'failed'; detail: string }>;
}

export interface CanonicalVerdict {
  readonly outcome: string;
  readonly verified: boolean;
  readonly reason: string;
  readonly files: readonly ProjectFile[];
}

/** A build that has not touched its project for this long is treated as crashed and can be replaced. */
export const STALE_RUN_MS = 60 * 60 * 1000;
/** Upper bound on projects per owner, so a client cannot create rows without limit. */
export const MAX_PROJECTS_PER_OWNER = 200;

export class BuilderService {
  constructor(private readonly deps: BuilderDeps) {}

  /**
   * Creates the durable project and its starter revision. Idempotent on (owner, requestKey):
   * a retry returns the same project and never a second one, including when an earlier attempt
   * died between creating the row and saving the starter source.
   */
  async createProject(userId: string, input: { prompt: string; requestKey: string; conversationId?: string | null }) {
    assertRequestKey(input.requestKey);
    const { spec } = deriveBuildSpec(input.prompt);
    const selection = selectStarter(spec);
    const seed = materializeStarter(selection, { prompt: input.prompt, title: spec.title });
    const existing = await this.deps.store.listProjects(userId, MAX_PROJECTS_PER_OWNER);
    if (existing.length >= MAX_PROJECTS_PER_OWNER && !existing.some((candidate) => candidate.requestKey === input.requestKey)) {
      throw new BuilderError('budget_exhausted', `A maximum of ${MAX_PROJECTS_PER_OWNER} projects is allowed.`);
    }
    const { project, created } = await this.deps.store.createProject(userId, {
      requestKey: input.requestKey,
      title: spec.title,
      spec,
      starter: seed.provenance,
      conversationId: input.conversationId ?? null,
    });
    let current = project;
    if (project.currentRevisionNumber === 0) {
      const result = await this.deps.store.appendRevision(userId, project.id, {
        runId: `starter:${project.id}`,
        origin: 'starter',
        files: seed.files,
        expectedParentId: null,
      });
      if (!result || result.kind === 'conflict') {
        throw new BuilderError('storage_failed', 'The starter source could not be saved; the project is not ready.');
      }
      const updated = await this.deps.store.setState(userId, project.id, 'specified', 'Requirements extracted and starter source saved.');
      current = updated ?? (await this.requireProject(userId, project.id));
    }
    return { project: current, created };
  }

  async requireProject(userId: string, projectId: string): Promise<BuilderProject> {
    const project = await this.deps.store.getProject(userId, projectId);
    if (!project) throw new BuilderError('not_found', 'Project not found.');
    return project;
  }

  async headFiles(userId: string, project: BuilderProject): Promise<{ revision: BuilderRevision | null; files: readonly ProjectFile[] }> {
    if (!project.currentRevisionId) return { revision: null, files: [] };
    const revision = await this.deps.store.getRevision(userId, project.id, project.currentRevisionId);
    if (!revision) throw new BuilderError('storage_failed', 'The current source revision could not be read.');
    return { revision, files: revision.files };
  }

  /**
   * Opens a build run: verifies ownership and that no other build is active, records the run,
   * and returns the binding the canonical pipeline builds against. The commit hook saves a
   * durable revision only when the canonical validation has accepted the result.
   */
  async beginRun(
    userId: string,
    projectId: string,
    input: { runId?: string; origin?: RevisionOrigin; /** Throws to refuse a result before it becomes a revision. */ guard?: (committed: readonly ProjectFile[], head: readonly ProjectFile[]) => void },
  ): Promise<BuilderRunBinding> {
    const runId = input.runId ?? randomUUID();
    const claimed = await this.deps.store.claimRun(userId, projectId, runId, new Date(Date.now() - STALE_RUN_MS));
    if (!claimed) throw new BuilderError('not_found', 'Project not found.');
    if (claimed.kind === 'busy') throw new BuilderError('conflict', 'A build is already running for this project.');
    const project = claimed.project;
    const { revision: head, files } = await this.headFiles(userId, project);
    const origin: RevisionOrigin = input.origin ?? (head && head.origin === 'starter' ? 'generation' : 'followup');
    const holder: { saved: Extract<AppendRevisionResult, { kind: 'created' | 'replayed' }> | null; noChange: boolean } = { saved: null, noChange: false };
    const commit: CommitFn = async ({ files: committedFiles }) => {
      input.guard?.(committedFiles, files);
      if (head && hashSnapshot(committedFiles) === head.contentSha256) {
        // Identical to the current source: nothing changed, so no revision is created.
        holder.noChange = true;
        return { commitSha: head.id };
      }
      const result = await this.deps.store.appendRevision(userId, projectId, {
        runId,
        origin,
        files: committedFiles,
        expectedParentId: head?.id ?? null,
      });
      if (!result) throw new BuilderError('not_found', 'Project not found.');
      if (result.kind === 'conflict') {
        throw new BuilderError('conflict', 'The project changed while this build was running. Nothing was overwritten.');
      }
      holder.saved = result;
      return { commitSha: result.revision.id };
    };
    return {
      projectId,
      runId,
      origin,
      parentRevisionId: head?.id ?? null,
      files,
      commit,
      project,
      saved: () => holder.saved?.revision ?? null,
      noChange: () => holder.noChange,
    };
  }

  /**
   * Closes a build run and records the state the evidence supports. `canonical` is the
   * canonical verdict; null means the engine did not run. Preview readiness decides VERIFIED
   * versus PARTIAL; nothing here reports more than was observed.
   */
  async completeRun(
    userId: string,
    run: BuilderRunBinding,
    canonical: CanonicalVerdict | null,
    launchPreview: (revision: BuilderRevision) => Promise<PreviewLaunchResult>,
  ): Promise<BuilderState> {
    const { projectId, runId } = run;
    const set = (state: BuilderProjectState, reason: string, active: string | null) => this.deps.store.setState(userId, projectId, state, reason, active);
    if (canonical === null) {
      await set('blocked', 'The canonical engineering engine is not enabled in this environment, so nothing was built.', null);
      return this.getState(userId, projectId);
    }
    let saved = run.saved();
    const verified = saved !== null && canonical.verified;
    if (!saved && canonical.files.length > 0) {
      // Keep the work product so it survives, explicitly marked as not verified.
      try {
        const kept = await this.deps.store.appendRevision(userId, projectId, {
          runId,
          origin: run.origin,
          files: canonical.files,
          expectedParentId: run.parentRevisionId,
        });
        if (kept && kept.kind !== 'conflict') {
          saved = kept.revision;
          await this.deps.store.setRevisionVerification(userId, projectId, kept.revision.id, 'failed');
        }
      } catch {
        // Unsaved work is reported as such below; it is never counted as saved.
      }
    }
    const blocked = canonical.outcome === 'blocked' || canonical.outcome === 'refused';
    if (!saved) {
      await set(blocked ? 'blocked' : 'failed', canonical.reason || 'The build did not produce a saved revision.', null);
      return this.getState(userId, projectId);
    }
    if (!verified) {
      await set(blocked ? 'blocked' : 'partial', canonical.reason || 'Source was saved but not verified.', null);
      return this.getState(userId, projectId);
    }
    await this.deps.store.setRevisionVerification(userId, projectId, saved.id, 'verified');
    await set('verifying', 'Checking the running application.', runId);
    let launch: PreviewLaunchResult;
    try {
      launch = await launchPreview(saved);
    } catch {
      launch = { started: false, strictReady: null, reason: 'The isolated runtime could not be started.' };
    }
    if (launch.started && launch.strictReady === true) {
      await set('verified', launch.reason, null);
    } else {
      await set('partial', `Source saved and validated, but the live preview is not verified: ${launch.reason}`, null);
    }
    return this.getState(userId, projectId);
  }

  /** Direct (non-chat) build: runs the canonical path itself, then closes the run. */
  async generate(
    userId: string,
    projectId: string,
    input: { prompt?: string; runId?: string; origin?: RevisionOrigin; launchPreview?: boolean; onEvent?: (event: SoftwareRunEvent) => void; signal?: AbortSignal },
  ): Promise<BuilderState> {
    const run = await this.beginRun(userId, projectId, { runId: input.runId, origin: input.origin });
    const prompt = input.prompt?.trim() || run.project.spec.objective;
    let outcome: UniversalBuildOutcome | null;
    try {
      outcome = await this.deps.runBuild({ userId, runId: run.runId, projectId, prompt, existingFiles: run.files, commit: run.commit, onEvent: input.onEvent, signal: input.signal });
    } catch (error) {
      const reason = error instanceof BuilderError ? error.message : 'The build stopped before completing.';
      await this.deps.store.setState(userId, projectId, input.signal?.aborted ? 'cancelled' : 'failed', reason, null);
      return this.getState(userId, projectId);
    }
    const preview = this.deps.preview;
    return this.completeRun(
      userId,
      run,
      outcome ? { outcome: outcome.result.outcome, verified: outcome.result.verified, reason: outcome.result.reason, files: outcome.result.files } : null,
      async (revision) => {
        if (input.launchPreview === false || !preview) {
          return { started: false, strictReady: null, reason: 'the live preview has not been run' };
        }
        return preview.launch({ userId, project: run.project, revision, outcome, runId: run.runId, onEvent: input.onEvent });
      },
    );
  }

  async getState(userId: string, projectId: string): Promise<BuilderState> {
    const project = await this.requireProject(userId, projectId);
    const revisions = await this.deps.store.listRevisions(userId, projectId);
    const head = revisions.find((revision) => revision.id === project.currentRevisionId) ?? null;
    const facts = this.deps.preview ? await this.safeFacts(userId, projectId) : null;
    const preview = derivePreviewLifecycle(
      facts
        ? {
            ...facts,
            // Only a recorded strict check can say the pages respond; liveness facts cannot.
            strictReady: project.state === 'verified' ? true : project.state === 'partial' && facts.requested ? false : facts.strictReady,
            stale: Boolean(head && facts.workspaceSha256 && facts.workspaceSha256 !== head.contentSha256),
          }
        : { requested: false, coordinatorStatus: null, runtimeRunning: false, processRunning: false, strictReady: null, grantExpiresAt: null, grantRevokedAt: null, stale: false },
    );
    return { project, head, preview, timeline: buildTimeline(project, head, preview) };
  }

  private async safeFacts(userId: string, projectId: string) {
    try {
      return await this.deps.preview!.facts(userId, projectId);
    } catch {
      return null;
    }
  }

  async listProjects(userId: string) {
    return this.deps.store.listProjects(userId);
  }

  async history(userId: string, projectId: string) {
    await this.requireProject(userId, projectId);
    return this.deps.store.listRevisions(userId, projectId);
  }

  async revisionFiles(userId: string, projectId: string, revisionId: string) {
    await this.requireProject(userId, projectId);
    const revision = await this.deps.store.getRevision(userId, projectId, revisionId);
    if (!revision) throw new BuilderError('not_found', 'Revision not found.');
    return revision;
  }
}

function buildTimeline(project: BuilderProject, head: Omit<BuilderRevision, 'files'> | null, preview: PreviewLifecycleView): BuilderState['timeline'] {
  const s = project.state;
  const built = project.currentRevisionNumber > 1 || (head !== null && head.origin !== 'starter');
  const failedLike = s === 'failed' || s === 'blocked' || s === 'cancelled';
  const step = (name: string, status: 'done' | 'active' | 'pending' | 'blocked' | 'failed', detail: string) => ({ step: name, status, detail });
  return [
    step('Understanding your project', 'done', `Requirements extracted (${project.spec.acceptanceCriteria.length} acceptance criteria).`),
    step('Preparing application', head ? 'done' : 'pending', head ? `${project.starter.starterId}@${project.starter.starterVersion} seeded and saved.` : 'Starter not saved yet.'),
    step(
      'Building',
      s === 'generating' ? 'active' : built ? 'done' : failedLike ? (s === 'blocked' ? 'blocked' : 'failed') : 'pending',
      s === 'generating' ? 'Implementing the application.' : built ? `Revision ${project.currentRevisionNumber} saved.` : project.stateReason,
    ),
    step(
      'Preview',
      preview.lifecycle === 'ready' ? 'done' : preview.lifecycle === 'starting' || s === 'verifying' ? 'active' : preview.lifecycle === 'failed' ? 'failed' : 'pending',
      preview.reason,
    ),
  ];
}
