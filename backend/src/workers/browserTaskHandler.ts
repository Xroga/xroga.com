/**
 * Browser automation as a task handler of the canonical scheduler (`ExecutionScheduler`, `ai/executionRuntime.ts`).
 *
 * There is no second orchestrator here. The scheduler already owns ordering, retries, per-task timeouts, run cancellation, evidence
 * and persistence; a browser step is one more handler, registered under an operation type. This module supplies what a REMOTE,
 * CRASHABLE worker needs on top of that, and nothing the scheduler already does:
 *
 *  - ISSUED AUTHORITY: the tenant and user are fixed when the handler is built by the trusted API. Nothing in the task, the run state,
 *    the page, or the worker's answer can change them. The project comes from the run and is re-authorised (not merely trusted) before
 *    dispatch and again before every durable write, so permission revoked mid-job stops the effects, not just the next job.
 *  - A FENCED LEASE per (tenant, run, task), renewed while the worker runs. A worker that lost its lease (stalled, replaced after a
 *    crash) is told to stop and its result is discarded; it cannot write evidence even if it wakes up late.
 *  - A STRICT RESULT CHECK: the worker is untrusted. Final and visited URLs must stay inside the job's scope and the egress policy, the
 *    counters must respect the limits, and artifacts are screened (names, types, credential-like content) BEFORE the first byte is stored.
 *  - IDEMPOTENT DURABLE EVIDENCE through Drive: artifacts are stored with `putServerObject` (READY only after read-back SHA-256) under a
 *    deterministic per-task name, and a retry reuses what an earlier attempt already stored instead of storing it twice.
 *
 * A worker's lease is released on every exit path. Page text and Stagehand output never reach this module as instructions.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { ExecutionEvidence, TaskHandler } from '../ai/executionRuntime.js';
import type { StorageService } from '../storage/storageService.js';
import { looksLikeCredential } from '../storage/migration/sources.js';
import { sanitizeFilename } from '../storage/keys.js';
import { StorageError, type ObjectClass, type StorageActor } from '../storage/types.js';
import { jobIdempotencyKey, navigationAllowed, parseBrowserJob, type BrowserJob, type BrowserJobLimits } from './browserJob.js';
import type { AdmissionController } from './admission.js';
import { redactText } from '../runtime/safeLogging.js';
import { LeaseError, type Lease, type LeaseStore } from './leaseStore.js';
import { evaluatePostconditions, parseBrowserPlan, type BrowserPlan, type ExtractedValue, type PostconditionResult } from './browserPlan.js';

export type BrowserTaskFailureCode =
  | 'PERMISSION_REVOKED' | 'LEASE_HELD' | 'LEASE_LOST' | 'JOB_TIMEOUT' | 'CANCELLED'
  | 'RESULT_OUT_OF_SCOPE' | 'RESULT_OVER_LIMIT' | 'ARTIFACT_REJECTED' | 'CREDENTIAL_LIKE_CONTENT' | 'STORAGE_FAILED' | 'WORKER_FAILED';

/** `code` and `safeReasons` are exactly the shape the scheduler persists for a typed failure. */
export class BrowserTaskError extends Error {
  readonly code: BrowserTaskFailureCode;
  readonly safeReasons: string[];
  constructor(code: BrowserTaskFailureCode, reason: string) {
    super(reason);
    this.name = 'BrowserTaskError';
    this.code = code;
    this.safeReasons = [reason];
  }
}

export interface BrowserWorkerArtifact {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}

export interface BrowserWorkerResult {
  finalUrl: string;
  visitedUrls: string[];
  navigations: number;
  responseBytes: number;
  summary: string;
  artifacts: BrowserWorkerArtifact[];
  /** values the plan's extract steps produced (untrusted data, judged only by the plan's postconditions) */
  extracted?: Record<string, ExtractedValue>;
  /** measured by the worker host, not by the page: timings, counters and model usage */
  metrics?: Record<string, unknown> & { consequentialActions?: number; modelUsage?: { calls: number; inputTokens: number; outputTokens: number; costMicros: number; refused: number } };
  steps?: Array<{ index: number; op: string; ok: boolean }>;
}

/** The seam to the isolated browser worker. A real implementation talks to the sandboxed container; tests substitute their own. */
export interface BrowserWorkerPort {
  run(job: BrowserJob, ctx: { signal: AbortSignal; lease: Lease; plan?: BrowserPlan }): Promise<BrowserWorkerResult>;
}

export interface BrowserHandlerDeps {
  /** issued by the trusted API from the authenticated session; never taken from a task or a worker */
  actor: StorageActor;
  drive: Pick<StorageService, 'putServerObject' | 'listObjects'>;
  leases: LeaseStore;
  worker: BrowserWorkerPort;
  workerId: string;
  /** re-checked before dispatch and before every durable write; false means the actor may no longer act on this project */
  authorise: (actor: StorageActor, projectId: string) => Promise<boolean>;
  /** the trusted plan's scope for this task: which origins, which start page, how much */
  scopeFor: (task: Parameters<TaskHandler>[0], state: Parameters<TaskHandler>[1]) => { allowedOrigins: string[]; startUrl: string; limits: BrowserJobLimits };
  /** bounded concurrency with tenant fairness; when set, a job waits for a slot before anything else happens */
  admission?: AdmissionController;
  leaseTtlMs?: number;
  /** max artifacts per job */
  maxArtifacts?: number;
  /** the trusted plan for this task (steps and postconditions), strictly parsed against the issued job; absent: legacy screenshot-only job */
  planFor?: (task: Parameters<TaskHandler>[0], state: Parameters<TaskHandler>[1], job: BrowserJob) => unknown;
  /** Drive project that holds this run's evidence; null stores it as the user's own (project-less) Drive object. Default: the job's project. */
  driveProjectFor?: (projectId: string) => string | null;
}

const ARTIFACT_TYPES: Record<string, ObjectClass> = {
  'image/png': 'screenshot', 'image/jpeg': 'screenshot', 'image/webp': 'screenshot',
  'application/json': 'evidence', 'text/plain': 'evidence', 'text/html': 'evidence', 'application/pdf': 'evidence',
};
const ARTIFACT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const LIST_PAGE = 500;
const LIST_PAGES = 4;

/** Existing READY object with exactly this name and hash, left by an earlier attempt of the same task. */
async function findStored(drive: BrowserHandlerDeps['drive'], actor: StorageActor, projectId: string | null, filename: string, sha256: string): Promise<string | null> {
  let afterId: string | undefined;
  for (let page = 0; page < LIST_PAGES; page++) {
    const rows = await drive.listObjects(actor, { projectId: projectId ?? undefined, limit: LIST_PAGE, afterId });
    const hit = rows.find((o) => o.filename === filename && o.sha256 === sha256 && o.state === 'READY');
    if (hit) return hit.id;
    if (rows.length < LIST_PAGE) return null;
    afterId = rows.at(-1)!.id;
  }
  return null;
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** Extracted page data is persisted with the run: keep it bounded and free of credential-looking text. */
function boundedExtracted(values: Record<string, ExtractedValue>): Record<string, ExtractedValue> | { truncated: true; bytes: number } {
  const text = redactText(JSON.stringify(values));
  if (text.length > 64 * 1024) return { truncated: true, bytes: text.length };
  try { return JSON.parse(text) as Record<string, ExtractedValue>; } catch { return { truncated: true, bytes: text.length }; }
}

export function createBrowserTaskHandler(deps: BrowserHandlerDeps): TaskHandler {
  const ttl = deps.leaseTtlMs ?? 30_000;
  const maxArtifacts = deps.maxArtifacts ?? 50;

  const run: TaskHandler = async (task, state, schedulerSignal) => {
    const scope = deps.scopeFor(task, state);
    // Authority is written AFTER the scope, so nothing scopeFor returns can override the issued tenant, user, project, run or task;
    // an unknown field in the scope is refused by the strict parser.
    const job = parseBrowserJob({
      ...scope,
      version: 1, tenantId: deps.actor.tenantId, userId: deps.actor.userId, projectId: state.projectId, runId: state.runId,
      taskId: task.id, attempt: Math.max(1, task.attempts),
    });

 const plan: BrowserPlan | undefined = deps.planFor ? parseBrowserPlan(deps.planFor(task, state, job), job) : undefined;
    const driveProject = deps.driveProjectFor ? deps.driveProjectFor(job.projectId) : job.projectId;
    if (!(await deps.authorise(deps.actor, job.projectId))) throw new BrowserTaskError('PERMISSION_REVOKED', 'the user no longer has access to this project');

    const key = { tenantId: job.tenantId, runId: job.runId, taskId: job.taskId };
    let lease = await deps.leases.acquire(key, deps.workerId, ttl);
    if (!lease) throw new BrowserTaskError('LEASE_HELD', 'another worker is already running this task');

    const controller = new AbortController();
    let why: 'lease' | 'timeout' | 'cancel' | null = null;
    const stop = (reason: NonNullable<typeof why>) => { why ??= reason; controller.abort(); };
    const onScheduler = () => stop('cancel');
    if (schedulerSignal.aborted) stop('cancel'); else schedulerSignal.addEventListener('abort', onScheduler, { once: true });
    const deadline = setTimeout(() => stop('timeout'), job.limits.maxDurationMs);
    const beat = setInterval(() => {
      deps.leases.renew(lease!, ttl).then((next) => { lease = next; }, (e) => { if (e instanceof LeaseError) stop('lease'); });
    }, Math.max(1, Math.floor(ttl / 3)));
    deadline.unref(); beat.unref();

    const guard = async (): Promise<Lease> => {
      if (controller.signal.aborted) throw why === 'timeout' ? new BrowserTaskError('JOB_TIMEOUT', 'the job exceeded its time limit')
        : why === 'cancel' ? new BrowserTaskError('CANCELLED', 'the run was cancelled') : new BrowserTaskError('LEASE_LOST', 'the worker lost its lease');
      try { await deps.leases.assertCurrent(lease!); } catch (e) {
        if (e instanceof LeaseError) throw new BrowserTaskError('LEASE_LOST', 'the worker lost its lease');
        throw e;
      }
      return lease!;
    };

    try {
      let result: BrowserWorkerResult;
      try {
        result = await deps.worker.run(job, { signal: controller.signal, lease, ...(plan ? { plan } : {}) });
      } catch (e) {
        await guard(); // a lost lease, timeout or cancel is reported as itself, not as a worker error
        if (e instanceof BrowserTaskError) throw e;
        throw new BrowserTaskError('WORKER_FAILED', 'the browser worker failed');
      }
      await guard();

      // The worker is untrusted: check its claims against the job.
      for (const url of [result.finalUrl, ...result.visitedUrls]) {
        if (!navigationAllowed(job, url)) throw new BrowserTaskError('RESULT_OUT_OF_SCOPE', 'the worker reported a page outside the allowed scope');
      }
      if (!Number.isSafeInteger(result.navigations) || result.navigations < 0 || result.navigations > job.limits.maxNavigations
        || !Number.isSafeInteger(result.responseBytes) || result.responseBytes < 0 || result.responseBytes > job.limits.maxResponseBytes
        || result.visitedUrls.length > job.limits.maxNavigations) {
        throw new BrowserTaskError('RESULT_OVER_LIMIT', 'the worker exceeded the job limits');
      }
      if (result.artifacts.length > maxArtifacts) throw new BrowserTaskError('RESULT_OVER_LIMIT', 'too many artifacts');
      let total = 0;
      const names = new Set<string>();
      for (const a of result.artifacts) {
        if (!ARTIFACT_NAME.test(a.name) || names.has(a.name) || !(a.mediaType in ARTIFACT_TYPES) || !(a.bytes instanceof Uint8Array) || a.bytes.length === 0) {
          throw new BrowserTaskError('ARTIFACT_REJECTED', 'an artifact has an invalid name, type or size');
        }
        names.add(a.name);
        total += a.bytes.length;
        if (looksLikeCredential(a.name, Buffer.from(a.bytes))) throw new BrowserTaskError('CREDENTIAL_LIKE_CONTENT', 'an artifact looks like it contains a credential');
      }
      if (total > job.limits.maxArtifactBytes) throw new BrowserTaskError('RESULT_OVER_LIMIT', 'artifact bytes exceed the job limit');

      const idem = jobIdempotencyKey(job).slice(0, 16);
      const now = () => new Date().toISOString();
      const evidence: ExecutionEvidence[] = [];
      const stored: Array<{ name: string; id: string; reused: boolean }> = [];
      for (const a of result.artifacts) {
        // Re-check authority and lease at the consequential boundary, immediately before the write.
        await guard();
        if (!(await deps.authorise(deps.actor, job.projectId))) throw new BrowserTaskError('PERMISSION_REVOKED', 'the user no longer has access to this project');
        const filename = sanitizeFilename(`${idem}-${a.name}`);
        const digest = sha256(a.bytes);
        let id: string | null = null;
        let reused = false;
        try {
          id = await findStored(deps.drive, deps.actor, driveProject, filename, digest);
          reused = id !== null;
          if (!id) {
            const object = await deps.drive.putServerObject(deps.actor, {
              projectId: driveProject, objectClass: ARTIFACT_TYPES[a.mediaType]!, filename, contentType: a.mediaType, body: Buffer.from(a.bytes),
            });
            if (object.state !== 'READY' || object.sha256 !== digest) throw new BrowserTaskError('STORAGE_FAILED', 'an artifact was not durably stored');
            id = object.id;
          }
        } catch (e) {
          if (e instanceof BrowserTaskError) throw e;
          if (e instanceof StorageError && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) throw new BrowserTaskError('PERMISSION_REVOKED', 'the user no longer has access to this project');
          throw new BrowserTaskError('STORAGE_FAILED', 'an artifact could not be stored');
        }
        stored.push({ name: a.name, id, reused });
        evidence.push({ id: randomUUID(), kind: 'drive_artifact', summary: `${a.name} sha256:${digest}${reused ? ' (reused from an earlier attempt)' : ''}`, identifier: `drive://${id}`, timestamp: now() });
      }
      await guard(); // the result is accepted only while the worker still holds the task

      // Outcome, not activity: the plan's postconditions are judged here, on the worker's report, by the trusted side.
      const postconditions: PostconditionResult[] = plan ? evaluatePostconditions(plan, {
        finalUrl: result.finalUrl, extracted: result.extracted ?? {},
        artifacts: result.artifacts.map((a) => ({ name: a.name, mediaType: a.mediaType, size: a.bytes.length })),
        consequentialActions: Number(result.metrics?.consequentialActions ?? 0),
      }) : [];
      const outcomeVerified = postconditions.every((p) => p.passed);
      const usage = result.metrics?.modelUsage;
      if (usage && usage.costMicros > job.limits.maxModelCostMicros) throw new BrowserTaskError('RESULT_OVER_LIMIT', 'model spend exceeded the job budget');
      if (plan) evidence.push({ id: randomUUID(), kind: 'browser_outcome', summary: `${postconditions.filter((p) => p.passed).length}/${postconditions.length} postconditions passed`, timestamp: now() });
      if (usage) evidence.push({ id: randomUUID(), kind: 'model_usage', summary: `${usage.calls} model calls, ${usage.inputTokens}+${usage.outputTokens} tokens, ${usage.costMicros} micro-USD, ${usage.refused} refused`, timestamp: now() });

      evidence.unshift({
        id: randomUUID(), kind: 'browser_run',
        summary: `${result.navigations} navigations, ${result.responseBytes} bytes, ended on ${new URL(result.finalUrl).hostname}; lease token ${lease!.token}`,
        timestamp: now(),
      });
      return {
        output: {
          // free text from an untrusted worker: never stored with a credential in it
          summary: redactText(String(result.summary)).slice(0, 2_000),
          finalHost: new URL(result.finalUrl).hostname, artifacts: stored, leaseToken: lease!.token,
          ...(plan ? { postconditions, outcomeVerified, extracted: boundedExtracted(result.extracted ?? {}) } : {}),
          ...(result.metrics ? { metrics: result.metrics } : {}),
        },
        evidence,
        // a task whose outcome did not verify is not complete, however many steps ran
        validated: outcomeVerified,
      };
    } finally {
      clearTimeout(deadline);
      clearInterval(beat);
      schedulerSignal.removeEventListener('abort', onScheduler);
      await deps.leases.release(lease!).catch(() => undefined);
    }
  };

  // Admission wraps the whole job. Authority and the lease are checked AFTER the wait, at the moment the job actually starts, so a
  // permission revoked while a job sat in the queue stops it, and no lease is held while merely queued.
  return async (task, state, signal) => {
    if (!deps.admission) return run(task, state, signal);
    const release = await deps.admission.acquire(deps.actor.tenantId, signal);
    try { return await run(task, state, signal); } finally { release(); }
  };
}
