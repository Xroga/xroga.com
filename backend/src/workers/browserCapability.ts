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
import type { Lease, LeaseStore } from './leaseStore.js';
import { isTerminalRunStatus, type BrowserRunRecord, type BrowserRunStore } from './browserRunStore.js';
import { recoverRunWithLeases } from './resumeRecovery.js';

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
  constructor(readonly status: 400 | 401 | 404 | 429, readonly code: 'RUN_INVALID' | 'TENANT_AUTH_REQUIRED' | 'PROJECT_NOT_FOUND' | 'RUN_LIMIT', message: string) { super(message); this.name = 'BrowserRunError'; }
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

interface BuiltRun { actor: StorageActor; runId: string; runProject: string; driveProject: string | null; limits: BrowserJobLimits; plan: BrowserPlan; state: ReturnType<typeof createCanonicalExecutionState>; request: BrowserRunRequest }

/** Validates the request against the issued context and builds the run. Nothing is stored or started here. */
async function buildRun(context: TenantContext, request: BrowserRunRequest, deps: BrowserCapabilityDeps): Promise<BuiltRun> {
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
  const state = createCanonicalExecutionState({ projectId: runProject, runId, requiredCapabilities: ['browser_automation'], tasks: [taskFor(request.goal, trustedPlan, limits)] });
  return { actor, runId, runProject, driveProject, limits, plan: trustedPlan, state, request };
}

function handlerFor(actor: StorageActor, spec: { allowedOrigins: string[]; startUrl: string; limits: BrowserJobLimits; plan: BrowserPlan; driveProject: string | null }, deps: BrowserCapabilityDeps) {
  return createBrowserTaskHandler({
    actor, drive: deps.drive, leases: deps.leases, worker: deps.worker, workerId: deps.workerId, admission: deps.admission,
    // the run's own project key is authorised by construction (it is the issued user's); a Drive project is re-checked every time
    authorise: async (a, projectId) => (projectId === `user:${actor.userId}` ? a.userId === actor.userId : deps.authoriseProject(a, projectId)),
    scopeFor: () => ({ allowedOrigins: spec.allowedOrigins, startUrl: spec.startUrl, limits: spec.limits }),
    planFor: () => spec.plan,
    driveProjectFor: () => spec.driveProject,
  });
}

/**
 * Validates the request against the issued context, then runs it on the canonical scheduler in THIS process. Returns the finished task
 * (completed only if every postcondition verified and the evidence is durably stored). The durable path is `prepareBrowserRun` and
 * `executeBrowserRun`, which let any instance run, cancel and recover a stored run.
 */
export async function runBrowserTask(context: TenantContext, request: BrowserRunRequest, deps: BrowserCapabilityDeps, signal?: AbortSignal) {
  const built = await buildRun(context, request, deps);
  const handler = handlerFor(built.actor, { allowedOrigins: request.allowedOrigins, startUrl: request.startUrl, limits: built.limits, plan: built.plan, driveProject: built.driveProject }, deps);
  const finished = await new ExecutionScheduler(deps.storeFor(built.actor.userId)).run(built.state, { browser_automation: handler }, signal);
  return { runId: built.runId, task: finished.tasks[0]!, state: finished };
}

/** Per-tenant ceiling on runs that are queued or running anywhere (all instances), enforced from the durable record. */
export const BROWSER_MAX_ACTIVE_PER_TENANT = 4;

/**
 * Validates and PERSISTS a run as `queued`. Nothing executes here: a dispatcher hands the run id to a worker, which loads the record.
 * The spec stored is the validated, server-parsed one, never the request body.
 */
export async function prepareBrowserRun(context: TenantContext, request: BrowserRunRequest, deps: BrowserCapabilityDeps & { runs: BrowserRunStore }): Promise<{ runId: string }> {
  const built = await buildRun(context, request, deps);
  if (await deps.runs.countActive(built.actor.tenantId) >= BROWSER_MAX_ACTIVE_PER_TENANT) throw new BrowserRunError(429, 'RUN_LIMIT', 'too many browser runs are active; wait for one to finish');
  await deps.runs.create({ tenantId: built.actor.tenantId, userId: built.actor.userId, state: built.state, spec: { goal: request.goal, startUrl: request.startUrl, allowedOrigins: request.allowedOrigins, limits: built.limits as unknown as Record<string, number>, plan: built.plan, driveProject: built.driveProject } });
  return { runId: built.runId };
}

export type ExecuteOutcome = 'finished' | 'already_finished' | 'held_by_live_worker' | 'not_found';

const CANCEL_POLL_MS = 500;
const EXECUTE_LEASE_TASK = 'execute';
const EXECUTE_LEASE_TTL_MS = 60_000;

/**
 * Runs a stored run to its end on this instance. Safe to call twice and from two instances: an execution lease on the run admits
 * one executor (the task handler holds its own task lease as well); a finished run is reported, never rerun. A run found `running` after its worker died resumes through the lease-aware recovery,
 * which never starts a second copy of a task a live worker still holds. The durable cancel flag is polled, so a cancel set on another
 * instance reaches the browser.
 */
export async function executeBrowserRun(runId: string, deps: BrowserCapabilityDeps & { runs: BrowserRunStore }, options: { signal?: AbortSignal; cancelPollMs?: number } = {}): Promise<ExecuteOutcome> {
  const record = await deps.runs.loadInternal(runId);
  if (!record) return 'not_found';
  if (isTerminalRunStatus(record.status)) return 'already_finished';

  const task = record.state.tasks[0];
  if (!task) return 'already_finished';
  // One executor per run across every instance: an execution lease on the run itself (the task has its own lease inside the handler).
  const executeLease = await deps.leases.acquire({ tenantId: record.tenantId, runId, taskId: EXECUTE_LEASE_TASK }, deps.workerId, EXECUTE_LEASE_TTL_MS);
  if (!executeLease) return 'held_by_live_worker';
  let lease = executeLease;
  try {
    // A previous worker may have died inside the task; until its task lease expires the task is not ours to resume.
    // Re-read under the lease: another executor may have finished the run between the first read and the lease.
    const fresh = await deps.runs.loadInternal(runId);
    if (!fresh || isTerminalRunStatus(fresh.status)) return 'already_finished';
    if (await deps.leases.holder({ tenantId: record.tenantId, runId, taskId: task.id })) return 'held_by_live_worker';
    return await executeWithLease(fresh, runId, deps, options, () => lease, (next) => { lease = next; });
  } finally {
    await deps.leases.release(lease).catch(() => undefined);
  }
}

async function executeWithLease(record: BrowserRunRecord, runId: string, deps: BrowserCapabilityDeps & { runs: BrowserRunStore }, options: { signal?: AbortSignal; cancelPollMs?: number }, current: () => Lease, setLease: (l: Lease) => void): Promise<ExecuteOutcome> {
  const actor: StorageActor = { userId: record.userId, tenantId: record.tenantId };
  const spec = record.spec;
  const handler = handlerFor(actor, { allowedOrigins: spec.allowedOrigins, startUrl: spec.startUrl, limits: spec.limits as unknown as BrowserJobLimits, plan: spec.plan as BrowserPlan, driveProject: spec.driveProject }, deps);

  const abort = new AbortController();
  const outer = options.signal;
  const forward = () => abort.abort();
  if (outer) { if (outer.aborted) abort.abort(); else outer.addEventListener('abort', forward, { once: true }); }
  const poll = async () => { try { if (await deps.runs.isCancelRequested(runId)) abort.abort(); } catch { /* a transient read failure must not stop a healthy run; the next poll retries */ } };
  await poll();
  const timer = setInterval(() => { void poll(); }, options.cancelPollMs ?? CANCEL_POLL_MS);
  timer.unref?.();
  // keep the execution lease alive; a lost lease means another instance took over, so this one stops
  const renewer = setInterval(() => { deps.leases.renew(current(), EXECUTE_LEASE_TTL_MS).then(setLease, () => abort.abort()); }, EXECUTE_LEASE_TTL_MS / 3);
  renewer.unref?.();
  try {
    const resumed = await recoverRunWithLeases(record.state, deps.leases, record.tenantId);
    await new ExecutionScheduler(deps.runs.stateStore(record.userId)).run(resumed.state, { browser_automation: handler }, abort.signal);
    return 'finished';
  } finally {
    clearInterval(timer); clearInterval(renewer);
    outer?.removeEventListener('abort', forward);
  }
}
