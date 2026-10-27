/**
 * /api/browser/runs — Xroga browser automation (INFRA-007 / PRODUCT-001). Mounted behind `authMiddleware`.
 *
 *   POST   /             start a run: { goal, startUrl, allowedOrigins, plan, limits?, projectId? } -> 202 { runId }
 *   GET    /:runId       the run's canonical state for its owner: task status, verified postconditions, Drive evidence
 *   DELETE /:runId       cancel a running run (owner only)
 *
 * Refuses with 503 when the browser host or private evidence storage is not configured: there is no hosted-browser fallback and no
 * run without durable evidence. Identity comes only from the issued TenantContext.
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { SupabaseExecutionStateStore, type ExecutionStateStore } from '../ai/executionRuntime.js';
import { TenantAccessError } from '../security/tenantErrors.js';
import { requireTenantContext } from '../security/tenantContext.js';
import { createPool, getStorageService } from '../storage/runtime.js';
import { AdmissionController } from '../workers/admission.js';
import { RemoteBrowserWorker } from '../workers/browserCoordinator.js';
import { BrowserRunError, runBrowserTask, type BrowserCapabilityDeps } from '../workers/browserCapability.js';
import { createBrowserModelGateway } from '../workers/browserModelGateway.js';
import { planBrowserTask } from '../workers/browserPlanner.js';
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

let production: BrowserCapabilityDeps | null | undefined;
/** Built once from the environment; null when the host, its secret or Drive is missing. */
function productionDeps(): BrowserCapabilityDeps | null {
  if (production !== undefined) return production;
  const url = process.env.XROGA_BROWSER_WORKER_URL; const secret = process.env.XROGA_BROWSER_COORDINATOR_SECRET; const drive = getStorageService();
  if (!url || !secret || !drive) { production = null; return production; }
  const aiModel = process.env.XROGA_BROWSER_AI_MODEL as ModelId | undefined;
  production = {
    worker: new RemoteBrowserWorker({ baseUrl: url, secret, ...(aiModel ? { gateway: createBrowserModelGateway({ modelId: aiModel }) } : {}) }),
    leases: new PostgresLeaseStore(createPool()), drive, storeFor: (userId) => new SupabaseExecutionStateStore(userId),
    // Drive's own owner check: listing a project the actor does not own throws
    authoriseProject: async (actor, projectId) => drive.listObjects(actor, { projectId, limit: 1 }).then(() => true, () => false),
    workerId: `api-${process.env.K_REVISION ?? 'local'}-${process.pid}`,
    admission: new AdmissionController({ maxConcurrent: 4, maxPerTenant: 2, maxQueuedPerTenant: 4, maxQueuedTotal: 32 }),
    ...(process.env.XROGA_BROWSER_PLANNER_MODEL ? { planner: async (goal: string, job: Parameters<typeof planBrowserTask>[1], allowAi: boolean, model: Parameters<NonNullable<BrowserCapabilityDeps['planner']>>[3]) => (await planBrowserTask(goal, job, { modelId: process.env.XROGA_BROWSER_PLANNER_MODEL as ModelId }, { allowAi,...model })).plan } : {}),
  };
  return production;
}

export function createBrowserRunsRouter(resolve: () => BrowserCapabilityDeps | null = productionDeps): Router {
  const router = Router();
  const running = new Map<string, { userId: string; abort: AbortController }>();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  const fail = (res: Response, e: unknown) => {
    if (e instanceof TenantAccessError) { res.status(e.status).json({ error: e.message, code: e.code }); return; }
    if (e instanceof BrowserRunError) { res.status(e.status).json({ error: e.message, code: e.code }); return; }
    if (e instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request', code: 'RUN_INVALID' }); return; }
    res.status(500).json({ error: 'Browser run failed', code: 'INTERNAL' });
  };

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const context = requireTenantContext(req.tenantContext);
      const deps = resolve();
      if (!deps) { res.status(503).json({ error: 'Browser automation is not configured on this deployment', code: 'BROWSER_WORKER_NOT_CONFIGURED' }); return; }
      const input = body.parse(req.body);
      const abort = new AbortController();
      // validation happens synchronously inside runBrowserTask before the scheduler starts; report its refusals directly
      let started: (runId: string) => void = () => {}; let refused: (e: unknown) => void = () => {};
      const ready = new Promise<string>((ok, no) => { started = ok; refused = no; });
      const store = deps.storeFor(context.userId);
      const trackingStore: ExecutionStateStore = { load: (id) => store.load(id), save: async (s) => { await store.save(s); if (!running.has(s.runId)) { running.set(s.runId, { userId: context.userId, abort }); started(s.runId); } } };
      runBrowserTask(context, { ...input, projectId: input.projectId ?? null }, { ...deps, storeFor: () => trackingStore }, abort.signal)
        .then((r) => running.delete(r.runId), (e) => refused(e));
      const runId = await ready;
      res.status(202).json({ runId });
    } catch (e) { fail(res, e); }
  });

  router.get('/:runId', async (req: AuthRequest, res) => {
    try {
      const context = requireTenantContext(req.tenantContext);
      const deps = resolve();
      if (!deps) { res.status(503).json({ error: 'Browser automation is not configured on this deployment', code: 'BROWSER_WORKER_NOT_CONFIGURED' }); return; }
      const runId = z.string().uuid().parse(req.params.runId);
      // the canonical store is owner-scoped: another user's run id loads as nothing
      const state = await deps.storeFor(context.userId).load(runId);
      const task = state?.tasks.find((t) => t.operationType === 'browser_automation');
      if (!state || !task) { res.status(404).json({ error: 'Run not found', code: 'RUN_NOT_FOUND' }); return; }
      res.json({ runId, status: task.status, attempts: task.attempts, output: task.output ?? null, evidence: task.evidence, blocker: task.blocker ?? null, running: running.has(runId), updatedAt: state.updatedAt });
    } catch (e) { fail(res, e); }
  });

  router.delete('/:runId', async (req: AuthRequest, res) => {
    try {
      const context = requireTenantContext(req.tenantContext);
      const runId = z.string().uuid().parse(req.params.runId);
      const r = running.get(runId);
      if (!r || r.userId !== context.userId) { res.status(404).json({ error: 'Run not found', code: 'RUN_NOT_FOUND' }); return; }
      r.abort.abort(); res.status(202).json({ runId, cancelling: true });
    } catch (e) { fail(res, e); }
  });
  return router;
}

export default createBrowserRunsRouter();
