/**
 * Browser automation as an Xroga capability (INFRA-007 / PRODUCT-001): a user request becomes ONE `browser_automation` task on the
 * canonical `ExecutionScheduler`, executed by the canonical browser task handler, with issued authority from the authenticated session.
 *
 * Nothing here is a second orchestrator or a second authorization system:
 *   - authority is the `TenantContext` the auth middleware issued (`requireTenantContext`); a body field can never name a user or tenant;
 *   - project ownership is checked through the injected `authoriseProject` (Drive's own owner check in production), before dispatch
 *     and again by the handler before every evidence write;
 *   - the run is persisted through the canonical execution store, so it has the same status, evidence and recovery record as any run;
 *   - the browser runs on the configured worker (the hardened host through `RemoteBrowserWorker`); there is no hosted-browser fallback.
 */
import { randomUUID } from 'node:crypto';
import { createCanonicalExecutionState, ExecutionScheduler, type ExecutableTaskNode, type ExecutionStateStore } from '../ai/executionRuntime.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import { actorFromTenantContext } from '../storage/runtime.js';
import type { StorageService } from '../storage/storageService.js';
import type { StorageActor } from '../storage/types.js';
import type { AdmissionController } from './admission.js';
import { BROWSER_JOB_CEILINGS, parseBrowserJob, type BrowserJob, type BrowserJobLimits } from './browserJob.js';
import { parseBrowserPlan, type BrowserPlan } from './browserPlan.js';
import { createBrowserTaskHandler, type BrowserWorkerPort } from './browserTaskHandler.js';
import type { LeaseStore } from './leaseStore.js';

/** Defaults are deliberately small; a request may ask for less or (up to the ceilings) more. No model spend unless asked for. */
export const BROWSER_RUN_DEFAULTS: Readonly<BrowserJobLimits> = Object.freeze({
  maxDurationMs: 3 * 60_000, maxNavigations: 30, maxRedirects: 5, maxPages: 3,
  maxResponseBytes: 64 * 1024 * 1024, maxArtifactBytes: 32 * 1024 * 1024, maxModelCostMicros: 0,
});

export interface BrowserRunRequest {
  goal: string;
  startUrl: string;
  allowedOrigins: string[];
  /** an explicit plan; when absent the configured planner derives one from the goal (its output is parsed like any plan) */
  plan?: unknown;
  /** allow the planner to use AI (Stagehand) steps; needs limits.maxModelCostMicros > 0 */
  allowAiSteps?: boolean;
  limits?: Partial<BrowserJobLimits>;
  /** a Drive project the user owns; null keeps the evidence as the user's own Drive objects */
  projectId?: string | null;
}

export interface BrowserCapabilityDeps {
  worker: BrowserWorkerPort;
  leases: LeaseStore;
  drive: Pick<StorageService, 'putServerObject' | 'listObjects'>;
  /** the canonical execution store for this user (SupabaseExecutionStateStore in production) */
  storeFor: (userId: string) => ExecutionStateStore;
  /** true when the actor owns the Drive project (production: Drive's owner check) */
  authoriseProject: (actor: StorageActor, projectId: string) => Promise<boolean>;
  workerId: string;
  admission?: AdmissionController;
  /** natural-language planning (browserPlanner.ts); absent means a request must carry an explicit plan */
  planner?: (goal: string, job: BrowserJob, allowAi: boolean) => Promise<BrowserPlan>;
}

export class BrowserRunError extends Error {
  constructor(readonly status: 400 | 401 | 404, readonly code: 'RUN_INVALID' | 'TENANT_AUTH_REQUIRED' | 'PROJECT_NOT_FOUND', message: string) { super(message); this.name = 'BrowserRunError'; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function taskFor(goal: string, plan: BrowserPlan, limits: BrowserJobLimits): ExecutableTaskNode {
  const consequential = !!plan.writeGrant;
  return {
    id: 'browser-1', objective: goal.slice(0, 500), operationType: 'browser_automation', requiredCapabilities: ['browser_automation'],
    selectedRuntime: 'xroga-browser-worker', selectedProvider: null, selectedModel: null, requiredContextReferences: [], allowedFiles: [],
    expectedOutputSchema: { postconditions: plan.expect.length }, dependencies: [], riskLevel: consequential ? 'high' : 'medium',
    timeoutMs: limits.maxDurationMs + 60_000,
    // a consequential plan is never retried automatically: an uncertain external effect is reported, not repeated
    retryPolicy: { maximumAttempts: consequential ? 1 : 2, initialBackoffMs: 2_000, maximumBackoffMs: 10_000 },
    budget: { maximumUsd: limits.maxModelCostMicros / 1_000_000 },
    validationMethod: ['postconditions'], evidenceRequirements: ['browser_run', 'browser_outcome'], fallbackRoutes: [],
    status: 'pending', attempts: 0, evidence: [],
  };
}

/**
 * Validates the request against the issued context, then runs it on the canonical scheduler. Returns the finished task (completed only
 * if every postcondition verified and the evidence is durably stored).
 */
export async function runBrowserTask(context: TenantContext, request: BrowserRunRequest, deps: BrowserCapabilityDeps, signal?: AbortSignal) {
  let actor: StorageActor;
  try { actor = actorFromTenantContext(requireTenantContext(context)); } catch { throw new BrowserRunError(401, 'TENANT_AUTH_REQUIRED', 'sign in again and retry'); }
  if (typeof request.goal !== 'string' || !request.goal.trim() || request.goal.length > 2_000) throw new BrowserRunError(400, 'RUN_INVALID', 'goal must be 1-2000 characters');

  const driveProject = request.projectId ?? null;
  if (driveProject !== null) {
    if (!UUID.test(driveProject) || !(await deps.authoriseProject(actor, driveProject))) throw new BrowserRunError(404, 'PROJECT_NOT_FOUND', 'project not found');
  }
  const runProject = driveProject ?? `user:${actor.userId}`;
  const limits = { ...BROWSER_RUN_DEFAULTS, ...(request.limits ?? {}) } as BrowserJobLimits;
  for (const k of Object.keys(limits) as (keyof BrowserJobLimits)[]) if (limits[k] > BROWSER_JOB_CEILINGS[k]) throw new BrowserRunError(400, 'RUN_INVALID', `limit ${k} exceeds the ceiling`);

  // validate the whole request up front with the same parsers the handler and the host use, so a bad request never becomes a run
  const runId = randomUUID();
  let plan: BrowserPlan;
  let job: BrowserJob;
  try {
    job = parseBrowserJob({ version: 1, tenantId: actor.tenantId, userId: actor.userId, projectId: runProject, runId, taskId: 'browser-1', attempt: 1, allowedOrigins: request.allowedOrigins, startUrl: request.startUrl, limits });
    if (request.plan === undefined && !deps.planner) throw new Error('a plan is required on this deployment');
    if (request.plan !== undefined) plan = parseBrowserPlan(request.plan, job);
  } catch (e) { throw new BrowserRunError(400, 'RUN_INVALID', (e as Error).message.slice(0, 300)); }
  if (request.plan === undefined) {
    try { plan = await deps.planner!(request.goal, job, !!request.allowAiSteps); } catch (e) { throw new BrowserRunError(400, 'RUN_INVALID', (e as Error).message.slice(0, 300)); }
  }
  const trustedPlan = plan!;

  const handler = createBrowserTaskHandler({
    actor, drive: deps.drive, leases: deps.leases, worker: deps.worker, workerId: deps.workerId, admission: deps.admission,
    // the run's own project key is authorised by construction (it is the issued user's); a Drive project is re-checked every time
    authorise: async (a, projectId) => (projectId === `user:${actor.userId}` ? a.userId === actor.userId : deps.authoriseProject(a, projectId)),
    scopeFor: () => ({ allowedOrigins: request.allowedOrigins, startUrl: request.startUrl, limits }),
    planFor: () => trustedPlan,
    driveProjectFor: () => driveProject,
  });
  const state = createCanonicalExecutionState({ projectId: runProject, runId, requiredCapabilities: ['browser_automation'], tasks: [taskFor(request.goal, trustedPlan, limits)] });
  const finished = await new ExecutionScheduler(deps.storeFor(actor.userId)).run(state, { browser_automation: handler }, signal);
  return { runId, task: finished.tasks[0]!, state: finished };
}
