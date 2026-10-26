/**
 * /api/browser/runs — Xroga browser automation (INFRA-007 / PRODUCT-001). Mounted behind `authMiddleware`.
 *
 *   POST   /             start a run: { goal, startUrl, allowedOrigins, plan, limits?, projectId? } -> 202 { runId }
 *   GET    /:runId       the run's canonical state for its owner: task status, verified postconditions, Drive evidence
 *   DELETE /:runId       cancel a run (owner only); the flag is durable, so it works from any instance
 *
 * A run is a durable record, not a promise in this process: POST validates and stores it, then hands the id to a dispatcher
 * (workers/browserRunDispatch.ts). Any instance can execute, cancel or recover it; see routes/browserRunInternal.ts.
 *
 * Refuses with 503 when the browser host or private evidence storage is not configured: there is no hosted-browser fallback and no
 * run without durable evidence. Identity comes only from the issued TenantContext.
 */
import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { TenantAccessError } from '../security/tenantErrors.js';
import { requireTenantContext } from '../security/tenantContext.js';
import { createPool, getStorageService } from '../storage/runtime.js';
import { AdmissionController } from '../workers/admission.js';
import { RemoteBrowserWorker } from '../workers/browserCoordinator.js';
import { BrowserRunError, executeBrowserRun, prepareBrowserRun, type BrowserCapabilityDeps } from '../workers/browserCapability.js';
import { createBrowserModelGateway } from '../workers/browserModelGateway.js';
import { planBrowserTask } from '../workers/browserPlanner.js';
import { dispatcherFromEnv, type BrowserRunDispatcher } from '../workers/browserRunDispatch.js';
import { PostgresBrowserRunStore, type BrowserRunStore } from '../workers/browserRunStore.js';
import { PostgresLeaseStore } from '../workers/postgresLeaseStore.js';
import type { ModelId } from '../ai/models.js';

const body = z.object({
  goal: z.string().min(1).max(2_000),
  startUrl: z.string().min(1).max(2_048),
  allowedOrigins: z.array(z.string().min(1).max(300)).min(1).max(20),
  plan: z.record(z.string(), z.unknown()).optional(),
  allowAiSteps: z.boolean().optional(),
  limits: z.record(z.string(), z.number().int().nonnegative()).optional(),
  projectId: z.string().uuid().nullish(),
}).strict();

/** Everything the browser-run routes need: the capability's dependencies plus the durable record and the dispatcher. */
export type BrowserRunRuntime = BrowserCapabilityDeps & { runs: BrowserRunStore; dispatcher: BrowserRunDispatcher };

/** Unique per process on any platform: Cloud Run containers all have pid 1, so a pid or a Fly machine id is not an identity. */
const WORKER_ID = `api-${process.env.K_REVISION ?? process.env.FLY_MACHINE_ID ?? 'local'}-${randomUUID().slice(0, 8)}`;
let production: BrowserRunRuntime | undefined;
/** Built once from the environment; null when the host, its secret or Drive is missing. */
export function productionBrowserRuntime(): BrowserRunRuntime | null {
  if (production) return production;
  const url = process.env.XROGA_BROWSER_WORKER_URL; const secret = process.env.XROGA_BROWSER_COORDINATOR_SECRET; const drive = getStorageService();
  // Not cached when something is missing: a cold start before a secret or Drive was ready must recover without a restart.
  if (!url || !secret || !drive) return null;
  const aiModel = process.env.XROGA_BROWSER_AI_MODEL as ModelId | undefined;
  const pool = createPool();
  const runs = new PostgresBrowserRunStore(pool);
  const base: BrowserCapabilityDeps = {
    worker: new RemoteBrowserWorker({ baseUrl: url, secret, ...(aiModel ? { gateway: createBrowserModelGateway({ modelId: aiModel }) } : {}) }),
    leases: new PostgresLeaseStore(pool), drive, storeFor: (userId) => runs.stateStore(userId),
    // Drive's own owner check: listing a project the actor does not own throws
    authoriseProject: async (actor, projectId) => drive.listObjects(actor, { projectId, limit: 1 }).then(() => true, () => false),
    workerId: WORKER_ID,
    // per-process host slots; the cross-instance per-tenant ceiling is the durable count in prepareBrowserRun
    admission: new AdmissionController({ maxConcurrent: 4, maxPerTenant: 2, maxQueuedPerTenant: 4, maxQueuedTotal: 32 }),
    ...(process.env.XROGA_BROWSER_PLANNER_MODEL ? { planner: async (goal: string, job: Parameters<typeof planBrowserTask>[1], allowAi: boolean) => (await planBrowserTask(goal, job, { modelId: process.env.XROGA_BROWSER_PLANNER_MODEL as ModelId }, { allowAi })).plan } : {}),
  };
  let dispatcher: BrowserRunDispatcher;
  try {
    const chosen = dispatcherFromEnv(process.env, (runId) => executeBrowserRun(runId, { ...base, runs }), (runId, e) => console.warn('[browser] run execution failed:', runId, e instanceof Error ? e.message : 'unknown'));
    dispatcher = chosen.dispatcher;
  } catch (e) {
    // a half-configured cloud dispatch must not silently become in-process execution
    console.error('[browser] dispatcher is misconfigured:', e instanceof Error ? e.message : 'unknown');
    return null;
  }
  production = { ...base, runs, dispatcher };
  return production;
}

export function createBrowserRunsRouter(resolve: () => BrowserRunRuntime | null = productionBrowserRuntime): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  const fail = (res: Response, e: unknown) => {
    if (e instanceof TenantAccessError) { res.status(e.status).json({ error: e.message, code: e.code }); return; }
    if (e instanceof BrowserRunError) { res.status(e.status).json({ error: e.message, code: e.code }); return; }
    if (e instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request', code: 'RUN_INVALID' }); return; }
    res.status(500).json({ error: 'Browser run failed', code: 'INTERNAL' });
  };
  const notConfigured = (res: Response) => res.status(503).json({ error: 'Browser automation is not configured on this deployment', code: 'BROWSER_WORKER_NOT_CONFIGURED' });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const context = requireTenantContext(req.tenantContext);
      const deps = resolve();
      if (!deps) { notConfigured(res); return; }
      const input = body.parse(req.body);
      // Write grants (consequential submit and upload) are issued only by the server's canonical action-grant path. A plan arriving
      // from a client is untrusted data: one that carries its own grant is refused outright, never parsed.
      if (input.plan && Object.hasOwn(input.plan, 'writeGrant')) {
        res.status(400).json({ error: 'A write grant is issued by the server and cannot be supplied in a request', code: 'RUN_INVALID' });
        return;
      }
      const { runId } = await prepareBrowserRun(context, { ...input, projectId: input.projectId ?? null }, deps);
      // The run is durable now. If the hand-off fails the record stays queued and the scheduled recovery dispatches it.
      try { await deps.dispatcher.dispatch(runId); } catch (e) { console.warn('[browser] dispatch failed, recovery will retry:', runId, e instanceof Error ? e.message : 'unknown'); }
      res.status(202).json({ runId });
    } catch (e) { fail(res, e); }
  });

  router.get('/:runId', async (req: AuthRequest, res) => {
    try {
      const context = requireTenantContext(req.tenantContext);
      const deps = resolve();
      if (!deps) { notConfigured(res); return; }
      const runId = z.string().uuid().parse(req.params.runId);
      // the canonical store is owner-scoped: another user's run id loads as nothing
      const record = await deps.runs.load(context.userId, runId);
      const task = record?.state.tasks.find((t) => t.operationType === 'browser_automation');
      if (!record || !task) { res.status(404).json({ error: 'Run not found', code: 'RUN_NOT_FOUND' }); return; }
      res.json({ runId, status: task.status, attempts: task.attempts, output: task.output ?? null, evidence: task.evidence, blocker: task.blocker ?? null, running: record.status === 'running', cancelRequested: record.cancelRequested, updatedAt: record.state.updatedAt });
    } catch (e) { fail(res, e); }
  });

  router.delete('/:runId', async (req: AuthRequest, res) => {
    try {
      const context = requireTenantContext(req.tenantContext);
      const deps = resolve();
      if (!deps) { notConfigured(res); return; }
      const runId = z.string().uuid().parse(req.params.runId);
      // The flag is the durable decision. The instance running the browser polls it; when nobody is running it, finish the
      // cancellation here so a queued run does not wait for a worker just to be told to stop.
      const outcome = await deps.runs.requestCancel(context.userId, runId);
      if (outcome === 'not_found') { res.status(404).json({ error: 'Run not found', code: 'RUN_NOT_FOUND' }); return; }
      if (outcome === 'already_finished') { res.status(409).json({ error: 'The run has already finished', code: 'RUN_FINISHED' }); return; }
      void executeBrowserRun(runId, deps).catch((e) => console.warn('[browser] cancel finalisation failed:', runId, e instanceof Error ? e.message : 'unknown'));
      res.status(202).json({ runId, cancelling: true });
    } catch (e) { fail(res, e); }
  });
  return router;
}

export default createBrowserRunsRouter();
