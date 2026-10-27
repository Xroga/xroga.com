import { buildFileTrail } from '../ai/patches.js';
import { tryUniversalBuild } from '../synthesis/universalEntrypoint.js';
import { createSoftwareProject } from '../synthesis/softwareProject.js';
import { deriveProjectRunState } from '../synthesis/projectRunState.js';
import { startOrRefreshLivePreview } from '../synthesis/livePreview/coordinator.js';
import { planLivePreview } from '../synthesis/livePreview/plan.js';
import { getLatestLivePreviewGrant } from '../synthesis/livePreview/store.js';
import { createProjectRuntimeManager, SupabaseProjectRuntimeStore } from '../synthesis/projectRuntime/index.js';
import { loadProjectRuntimeSession } from '../security/runtimeProjectBinding.js';
import { hashSnapshot } from './snapshot.js';
import { verifyAppReadiness, type RuntimeExec } from './readiness.js';
import type { BuildRunner, PreviewLaunchResult, PreviewPort } from './service.js';
import type { BuilderRevision } from './types.js';

/**
 * Production adapters. Both delegate to the canonical systems: tryUniversalBuild (which drives
 * SoftwareAgent/Cline on the ExecutionScheduler) and the live-preview coordinator over
 * ProjectRuntimeManager. They add no scheduler, runtime or preview of their own, and name no
 * hosting provider: the runtime provider is whatever ProjectRuntimeManager is configured with.
 */

export const canonicalBuildRunner: BuildRunner = (input) =>
  tryUniversalBuild({
    runId: input.runId,
    userId: input.userId,
    projectId: input.projectId,
    prompt: input.prompt,
    existingFiles: input.existingFiles,
    commit: input.commit,
    onEvent: input.onEvent,
  });

function runtimeExec(userId: string, sessionId: string): RuntimeExec {
  return async (command) => {
    const result = await createProjectRuntimeManager(userId).exec(sessionId, {
      command: command.command,
      args: [...command.args],
      networkPolicy: 'preview',
      timeoutMs: command.timeoutMs,
    });
    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut };
  };
}

async function strictReadiness(userId: string, sessionId: string, revision: BuilderRevision): Promise<PreviewLaunchResult> {
  const report = await verifyAppReadiness({ exec: runtimeExec(userId, sessionId), files: revision.files });
  return { started: true, strictReady: report.ready, reason: report.reason };
}

export const canonicalPreviewPort: PreviewPort = {
  async launch({ userId, project, revision, outcome, runId, onEvent }) {
    if (!outcome?.buildContract) {
      return { started: false, strictReady: null, reason: 'no build contract was produced for this run' };
    }
    const result = outcome.result;
    const parent = revision.parentRevisionId ? await new SupabaseProjectRuntimeStore().loadLatestRevision(userId, project.id) : null;
    const softwareProject = createSoftwareProject({
      contract: outcome.buildContract,
      files: revision.files,
      fileTrail: buildFileTrail([...(parent?.project.workspace.files ?? [])], [...revision.files]),
      lifecycle: deriveProjectRunState({
        outcome: result.outcome,
        phaseReached: result.phaseReached,
        verified: result.verified,
        fileCount: revision.files.length,
        commitSha: revision.id,
        reason: result.reason,
        blockers: result.blockers,
        publicationRequested: false,
        deploymentRequested: false,
      }),
      architecture: result.plan?.architecture ?? null,
      recipe: result.plan?.productIntelligence.recipe ?? null,
      filePlan: result.plan?.productIntelligence.filePlan ?? null,
      verified: result.verified,
      evidence: result.evidence,
      reason: result.reason,
      blockers: result.blockers,
    });
    const started = await startOrRefreshLivePreview({
      userId,
      project: softwareProject,
      runId,
      forceRestart: true,
      emit: onEvent ? (event) => onEvent(event as never) : undefined,
    });
    await new SupabaseProjectRuntimeStore().saveRevision(userId, started.project);
    if (started.preview.status !== 'ready' || !started.project.runtime) {
      return { started: false, strictReady: null, reason: started.preview.message || `the preview is ${started.preview.status}` };
    }
    return strictReadiness(userId, started.project.runtime.sessionId, revision);
  },

  async verify({ userId, projectId, revision }) {
    const store = new SupabaseProjectRuntimeStore();
    const latest = await store.loadLatestRevision(userId, projectId);
    const binding = latest?.project.runtime;
    if (!latest || !binding) return { started: false, strictReady: null, reason: 'no running preview was found for this project' };
    const session = await loadProjectRuntimeSession(store, userId, projectId, binding.sessionId);
    if (!session || session.status !== 'running') return { started: false, strictReady: null, reason: 'the isolated runtime is not running' };
    return strictReadiness(userId, session.sessionId, revision);
  },

  async facts(userId, projectId) {
    const store = new SupabaseProjectRuntimeStore();
    const latest = await store.loadLatestRevision(userId, projectId);
    const none = { requested: false, coordinatorStatus: null, runtimeRunning: false, processRunning: false, strictReady: null, grantExpiresAt: null, grantRevokedAt: null, workspaceSha256: null } as const;
    if (!latest) return none;
    const binding = latest.project.runtime;
    const plan = planLivePreview(latest.project);
    if (!(plan.process || plan.command)) return { ...none, requested: true, coordinatorStatus: 'not_applicable' };
    let session = binding ? await loadProjectRuntimeSession(store, userId, projectId, binding.sessionId) : null;
    let runtimeRunning = false;
    if (session && session.runtimeClass === 'interactive' && session.status === 'running') {
      try {
        session = await createProjectRuntimeManager(userId).restore(session.sessionId);
        runtimeRunning = true;
      } catch {
        runtimeRunning = false;
      }
    }
    let processRunning = false;
    if (runtimeRunning && session && plan.process) {
      const process = [...session.processes].reverse().find((item) => item.status === 'running' && item.port === plan.process?.port);
      if (process) {
        const probe = await createProjectRuntimeManager(userId)
          .exec(session.sessionId, { command: 'kill', args: ['-0', String(process.pid)], networkPolicy: 'none', timeoutMs: 5_000 })
          .catch(() => null);
        processRunning = probe?.exitCode === 0;
      }
    }
    const grant = session ? await getLatestLivePreviewGrant({ userId, projectId, sessionId: session.sessionId }) : null;
    return {
      requested: true,
      coordinatorStatus: !binding ? 'failed' : runtimeRunning ? 'ready' : 'stopped',
      runtimeRunning,
      processRunning,
      // Liveness never proves page readiness; the builder records the strict check result itself.
      strictReady: null,
      grantExpiresAt: grant?.expiresAt ?? null,
      grantRevokedAt: grant?.revokedAt ?? null,
      // Which source the running preview was started from, so a stale preview is reported as degraded.
      workspaceSha256: hashSnapshot(latest.project.workspace.files),
    };
  },
};
