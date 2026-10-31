import{classifyOutboundData}from'../security/egress/dataClassification.js';
import{isDeepStrictEqual}from'node:util';
import{createTenantContext}from'../security/tenantContext.js';
import type{BrowserModelAuthority}from'./browserModelDispatch.js';
import{BrowserTaskError}from'./browserTaskHandler.js';
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
  /** Explicit fresh-session stages, each bounded by the original attempt ceiling. */
  continuations?: { startUrl: string; plan: unknown }[];
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
  planner?: (goal: string, job: BrowserJob, allowAi: boolean, model:{authority:BrowserModelAuthority;signal:AbortSignal}) => Promise<BrowserPlan>;
}

export class BrowserRunError extends Error {
  constructor(readonly status: 400 | 401 | 404 | 429, readonly code: 'RUN_INVALID' | 'TENANT_AUTH_REQUIRED' | 'PROJECT_NOT_FOUND' | 'RUN_LIMIT', message: string) { super(message); this.name = 'BrowserRunError'; }
}

/** Browser requests and explicit/planner plans share the existing credential
 * floor. A direct plan cannot bypass model-gateway DLP or carry a secret to
 * the isolated worker, URL query, execution checkpoint or artifact path. */
function assertBrowserInput(input:unknown):void {
  let classification;
  try { classification=classifyOutboundData(input,'USER_PRIVATE').classification; }
  catch { throw new BrowserRunError(400,'RUN_INVALID','Browser input could not be safely classified.'); }
  if(classification==='CREDENTIAL_SECRET')throw new BrowserRunError(400,'RUN_INVALID','Credential material is not permitted in browser tasks.');
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

interface BuiltRun { actor: StorageActor; runId: string; runProject: string; driveProject: string | null; limits: BrowserJobLimits; plan: BrowserPlan; continuations?: {startUrl:string;plan:BrowserPlan}[]; state: ReturnType<typeof createCanonicalExecutionState>; request: BrowserRunRequest }

function parseContinuations(input: unknown, job: BrowserJob): {startUrl:string;plan:BrowserPlan}[] | undefined {
  if(input===undefined)return undefined;
  if(!Array.isArray(input)||input.length<1||input.length>11||job.limits.maxModelCostMicros!==0)
    throw new BrowserRunError(400,'RUN_INVALID','Continuation requires 1-11 explicit model-free stages.');
  return input.map((stage,index)=>{
    if(!stage||typeof stage!=='object'||Object.keys(stage).some(k=>!['startUrl','plan'].includes(k)))throw new BrowserRunError(400,'RUN_INVALID','Invalid continuation stage.');
    assertBrowserInput(stage);
    const nextJob=parseBrowserJob({...job,taskId:`browser-${index+2}`,startUrl:stage.startUrl});
    const plan=parseBrowserPlan(stage.plan,nextJob);
    if(plan.writeGrant)throw new BrowserRunError(400,'RUN_INVALID','Continuation cannot carry action authority.');
    return {startUrl:nextJob.startUrl,plan};
  });
}

function stageTasks(goal:string,plan:BrowserPlan,limits:BrowserJobLimits,continuations?:{startUrl:string;plan:BrowserPlan}[]) {
  return [plan,...(continuations??[]).map(stage=>stage.plan)].map((item,index)=>({
    ...taskFor(goal,item,limits),id:`browser-${index+1}`,dependencies:index?[`browser-${index}`]:[],
  }));
}

/** Validates the request against the issued context and builds the run. Nothing is stored or started here. */
async function buildRun(context: TenantContext, request: BrowserRunRequest, deps: BrowserCapabilityDeps,signal:AbortSignal=new AbortController().signal): Promise<BuiltRun> {
  let actor: StorageActor;
  try { actor = actorFromTenantContext(requireTenantContext(context)); } catch { throw new BrowserRunError(401, 'TENANT_AUTH_REQUIRED', 'sign in again and retry'); }
  request=structuredClone(request);
  assertBrowserInput({goal:request.goal,startUrl:request.startUrl,allowedOrigins:request.allowedOrigins,plan:request.plan??null});
  if (typeof request.goal !== 'string' || !request.goal.trim() || request.goal.length > 2_000) throw new BrowserRunError(400, 'RUN_INVALID', 'goal must be 1-2000 characters');

  signal.throwIfAborted();
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
    try { plan = await deps.planner!(request.goal,job,!!request.allowAiSteps,{signal,authority:{context,revalidate:async()=>{
      signal.throwIfAborted();if(driveProject&&!(await deps.authoriseProject(actor,driveProject)))throw new BrowserRunError(404,'PROJECT_NOT_FOUND','project ownership was revoked');signal.throwIfAborted();
    }}}); } catch { throw new BrowserRunError(400,'RUN_INVALID','the browser plan could not be safely authorized, completed and accounted for'); }
  }
  const trustedPlan=parseBrowserPlan(plan!,job!);signal.throwIfAborted();
  assertBrowserInput({goal:request.goal,startUrl:request.startUrl,allowedOrigins:request.allowedOrigins,plan:trustedPlan});
  // Serialized plans never issue consequential authority, including recovered plans.
  if(trustedPlan.writeGrant)throw new BrowserRunError(400,'RUN_INVALID','Consequential browser execution requires canonical approval and cannot use a supplied write grant.');

  const continuations=parseContinuations(request.continuations,job!);
  const state = createCanonicalExecutionState({ projectId: runProject, runId, requiredCapabilities: ['browser_automation'], tasks: stageTasks(request.goal,trustedPlan,limits,continuations) });
  return { actor, runId, runProject, driveProject, limits, plan: trustedPlan, continuations, state, request };
}

function handlerFor(context:TenantContext, spec: { allowedOrigins: string[]; startUrl: string; limits: BrowserJobLimits; plan: BrowserPlan; continuations?:{startUrl:string;plan:BrowserPlan}[]; driveProject: string | null }, deps: BrowserCapabilityDeps,revalidate?:()=>Promise<void>) {
  const actor=actorFromTenantContext(requireTenantContext(context));
  const stages=[{startUrl:spec.startUrl,plan:spec.plan},...(spec.continuations??[])];
  const stageFor=(id:string)=>{const index=stages.findIndex((_,i)=>id===`browser-${i+1}`);if(index<0)throw new BrowserTaskError('PERMISSION_REVOKED','unknown browser stage');return stages[index]!;};
  return createBrowserTaskHandler({
    actor,tenantContext:context, drive: deps.drive, leases: deps.leases, worker: deps.worker, workerId: deps.workerId, admission: deps.admission,
    // the run's own project key is authorised by construction (it is the issued user's); a Drive project is re-checked every time
    authorise: async (a,projectId)=>{await revalidate?.();return projectId===`user:${actor.userId}`?a.userId===actor.userId:deps.authoriseProject(a,projectId);},
    scopeFor: (task,state) => {
      const limits={...spec.limits};
      if(stages.length>1){
        // Storage/network ceilings remain run-wide, rather than multiplying them
        // when one workflow is split into independently checkpointed stages.
        for(const key of ['maxResponseBytes','maxArtifactBytes','maxNavigations'] as const)limits[key]=Math.floor(limits[key]/stages.length);
        const remaining=Date.parse(state.createdAt)+120*60_000-Date.now();
        if(!Number.isFinite(remaining)||remaining<=0)throw new BrowserTaskError('PERMISSION_REVOKED','browser workflow authorization expired');
        limits.maxDurationMs=Math.min(limits.maxDurationMs,remaining);
      }
      return {allowedOrigins:spec.allowedOrigins,startUrl:stageFor(task.id).startUrl,limits};
    },
    planFor: (task) => stageFor(task.id).plan,
    driveProjectFor: () => spec.driveProject,
  });
}

/**
 * Validates the request against the issued context, then runs it on the canonical scheduler in THIS process. Returns the finished task
 * (completed only if every postcondition verified and the evidence is durably stored). The durable path is `prepareBrowserRun` and
 * `executeBrowserRun`, which let any instance run, cancel and recover a stored run.
 */
export async function runBrowserTask(context: TenantContext, request: BrowserRunRequest, deps: BrowserCapabilityDeps, signal?: AbortSignal) {
  const built = await buildRun(context, request, deps,signal);
  const handler = handlerFor(context, { allowedOrigins: built.request.allowedOrigins, startUrl: built.request.startUrl, limits: built.limits, plan: built.plan, continuations:built.continuations, driveProject: built.driveProject }, deps);
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
  await deps.runs.create({ tenantId: built.actor.tenantId, userId: built.actor.userId, state: built.state, spec: { goal: built.request.goal, startUrl: built.request.startUrl, allowedOrigins: built.request.allowedOrigins, limits: built.limits as unknown as Record<string, number>, plan: built.plan, ...(built.continuations?{continuations:built.continuations}:{}), driveProject: built.driveProject } });
  return { runId: built.runId };
}

export type ExecuteOutcome = 'finished' | 'yielded' | 'already_finished' | 'held_by_live_worker' | 'not_found';

const CANCEL_POLL_MS = 500;
const EXECUTE_LEASE_TASK = 'execute';
const EXECUTE_LEASE_TTL_MS = 60_000;

/**
 * Runs a stored run to its end on this instance. Safe to call twice and from two instances: an execution lease on the run admits
 * one executor (the task handler holds its own task lease as well); a finished run is reported, never rerun. A run found `running` after its worker died resumes through the lease-aware recovery,
 * which never starts a second copy of a task a live worker still holds. The durable cancel flag is polled, so a cancel set on another
 * instance reaches the browser.
 */
export async function executeBrowserRun(runId: string, deps: BrowserCapabilityDeps & { runs: BrowserRunStore }, options: { signal?: AbortSignal; cancelPollMs?: number; yieldAfterStage?: boolean } = {}): Promise<ExecuteOutcome> {
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
    for(const candidate of fresh.state.tasks)if (await deps.leases.holder({ tenantId: record.tenantId, runId, taskId: candidate.id })) return 'held_by_live_worker';
    return await executeWithLease(fresh, runId, deps, options, () => lease, (next) => { lease = next; });
  } finally {
    await deps.leases.release(lease).catch(() => undefined);
  }
}

async function executeWithLease(record: BrowserRunRecord, runId: string, deps: BrowserCapabilityDeps & { runs: BrowserRunStore }, options: { signal?: AbortSignal; cancelPollMs?: number; yieldAfterStage?: boolean }, current: () => Lease, setLease: (l: Lease) => void): Promise<ExecuteOutcome> {
  const source=structuredClone(record.spec),owner=record.userId,tenant=record.tenantId,project=record.projectKey;
  const ownedRun=async()=>{
    await deps.leases.assertCurrent(current());
    const row=await deps.runs.load(owner,runId);
    if(!row||!UUID.test(owner)||tenant!==owner||row.userId!==owner||row.tenantId!==tenant||row.runId!==runId||row.projectKey!==project||row.state.runId!==runId||row.state.projectId!==project||!isDeepStrictEqual(row.spec,source))throw new BrowserTaskError('PERMISSION_REVOKED','durable browser ownership or source changed');
    await deps.leases.assertCurrent(current());return row;
  };
  const owned=await ownedRun();
  // No request user ID, serialized context or arbitrary record issues authority.
  // browser_runs is service-only, and this exact owner-scoped row is read under
  // the current canonical execution lease before using persisted_owner provenance.
  const context=createTenantContext({userId:owned.userId,via:'persisted_owner'});
  const spec=owned.spec;
  let plan: BrowserPlan;
  let continuations: {startUrl:string;plan:BrowserPlan}[] | undefined;
  try {
    assertBrowserInput({goal:spec.goal,startUrl:spec.startUrl,allowedOrigins:spec.allowedOrigins,plan:spec.plan});
    const job=parseBrowserJob({version:1,userId:context.userId,tenantId:context.tenantId,projectId:project,runId,taskId:'browser-1',attempt:Math.max(1,owned.state.tasks[0]?.attempts??1),allowedOrigins:spec.allowedOrigins,startUrl:spec.startUrl,limits:spec.limits});
    plan=parseBrowserPlan(spec.plan,job);
    continuations=parseContinuations(spec.continuations,job);
    const expected=stageTasks(spec.goal,plan,job.limits,continuations);
    if(owned.state.tasks.length!==expected.length||owned.state.tasks.some((task,index)=>task.id!==expected[index]!.id||!isDeepStrictEqual(task.dependencies,expected[index]!.dependencies)))throw new Error('stage graph changed');
    if(plan.writeGrant)throw new BrowserTaskError('PERMISSION_REVOKED','durable browser plans cannot supply action authority');
  } catch {
    // A legacy queued spec is data, not authority. Preserve its recovery record
    // but persist a sanitized terminal verdict so another instance cannot retry it.
    const row=await ownedRun(),state=structuredClone(row.state),task=state.tasks[0];
    if(!task)throw new BrowserTaskError('PERMISSION_REVOKED','browser state is no longer valid');
    task.status='blocked';task.blocker='Browser input or action authority was denied by security policy.';
    task.completedAt=new Date().toISOString();state.updatedAt=task.completedAt;
    state.blockers=[...state.blockers,task.blocker];
    await deps.leases.assertCurrent(current());
    await deps.runs.stateStore(owner,current).save(state);
    return 'finished';
  }
  const handler=handlerFor(context,{allowedOrigins:spec.allowedOrigins,startUrl:spec.startUrl,limits:spec.limits as unknown as BrowserJobLimits,plan,continuations,driveProject:spec.driveProject},deps,async()=>{
    const row=await ownedRun();if(row.cancelRequested)throw new BrowserTaskError('CANCELLED','the run was cancelled');if(isTerminalRunStatus(row.status))throw new BrowserTaskError('PERMISSION_REVOKED','the run is no longer active');
  });

  const abort = new AbortController();
  const outer = options.signal;
  const forward = () => abort.abort();
  if (outer) { if (outer.aborted) abort.abort(); else outer.addEventListener('abort', forward, { once: true }); }
  const poll = async () => { try { if (await deps.runs.isCancelRequested(runId)) abort.abort(); } catch { abort.abort(); /* an unavailable revocation read cannot retain execution authority */ } };
  await poll();
  const timer = setInterval(() => { void poll(); }, options.cancelPollMs ?? CANCEL_POLL_MS);
  timer.unref?.();
  // keep the execution lease alive; a lost lease means another instance took over, so this one stops
  const renewer = setInterval(() => { deps.leases.renew(current(), EXECUTE_LEASE_TTL_MS).then(setLease, () => abort.abort()); }, EXECUTE_LEASE_TTL_MS / 3);
  renewer.unref?.();
  try {
    const resumed = await recoverRunWithLeases(record.state, deps.leases, record.tenantId);
    const state=await new ExecutionScheduler(deps.runs.stateStore(record.userId,current)).run(resumed.state, { browser_automation: handler }, abort.signal,{yieldAfterBatch:options.yieldAfterStage});
    return state.tasks.some(task=>['pending','ready','running'].includes(task.status))?'yielded':'finished';
  } finally {
    clearInterval(timer); clearInterval(renewer);
    outer?.removeEventListener('abort', forward);
  }
}
