import { createHash, randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { createCanonicalExecutionState, type ExecutableTaskNode } from '../ai/executionRuntime.js';
import type { AuthRequest } from '../middleware/auth.js';
import { publicHttpsUrl } from '../security/boundedPublicGet.js';
import { classifyOutboundData } from '../security/egress/dataClassification.js';
import { requireTenantContext } from '../security/tenantContext.js';
import { createPool } from '../storage/runtime.js';
import { BROWSER_RUN_DEFAULTS } from '../workers/browserCapability.js';
import { parseBrowserJob } from '../workers/browserJob.js';
import type { Lease, LeaseStore } from '../workers/leaseStore.js';
import { dispatchBrowserModel } from '../workers/browserModelDispatch.js';
import { isTerminalRunStatus, PostgresBrowserRunStore, type BrowserRunRecord, type BrowserRunStore } from '../workers/browserRunStore.js';
import { PostgresLeaseStore } from '../workers/postgresLeaseStore.js';

const MODEL = 'deepseek_v4_1_flash_1017';
const MAX_TURNS = 12;
const TURN_CEILING_MICROS = 3_000;
const RUN_MS = 10 * 60_000;
const limits = { ...BROWSER_RUN_DEFAULTS, maxDurationMs: RUN_MS, maxModelCostMicros: MAX_TURNS * TURN_CEILING_MICROS };
const id = z.string().uuid();
const startBody = z.object({ goal: z.string().trim().min(1).max(2_000), startUrl: z.string().max(2_048) }).strict();
const tool = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string().regex(/^[a-z_]{1,50}$/),
    description: z.string().max(6_000).optional(),
    parameters: z.record(z.string(), z.unknown()),
    strict: z.boolean().optional(),
  }).strict(),
}).strict();
const toolCall = z.object({
  id: z.string().max(200), type: z.literal('function'),
  function: z.object({ name: z.string().max(50), arguments: z.string().max(16_000) }).strict(),
}).strict();
const message = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([z.string().max(48_000), z.array(z.object({ type: z.literal('text'), text: z.string().max(48_000) }).strict()).max(24), z.null()]).optional(),
  tool_calls: z.array(toolCall).max(20).optional(),
  tool_call_id: z.string().max(200).optional(),
}).strict();
const turnBody = z.object({
  turn: z.number().int().min(1).max(MAX_TURNS),
  messages: z.array(message).min(1).max(140),
  tools: z.array(tool).max(32).optional(),
  tool_choice: z.enum(['auto', 'none', 'required']).optional(),
  max_tokens: z.number().int().min(1).max(4_096).optional(),
}).strict();
const endBody = z.object({
  status: z.enum(['completed', 'failed', 'cancelled']),
  result: z.string().max(12_000).optional(),
  actions: z.array(z.string().regex(/^[a-z_]{1,50}$/)).max(48).default([]),
}).strict();

type Runtime = { runs: BrowserRunStore; leases: LeaseStore };
let runtime: Runtime | undefined;
const configured = () => {
  if (process.env.XROGA_LOCAL_BROWSER_ENABLED !== 'true') return null;
  if (!runtime) {
    const pool = createPool();
    runtime = { runs: new PostgresBrowserRunStore(pool), leases: new PostgresLeaseStore(pool) };
  }
  return runtime;
};

class BrowserRequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

function checkData(value: unknown) {
  try {
    if (classifyOutboundData(value).classification !== 'CREDENTIAL_SECRET') return;
  } catch { /* unbounded or invalid payload */ }
  throw new BrowserRequestError(400, 'BROWSER_DATA_DENIED');
}

function sendError(res: Response, error: unknown) {
  if (error instanceof BrowserRequestError) return res.status(error.status).json({ error: error.code });
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'BROWSER_REQUEST_INVALID' });
  // No user payload, raw provider error, or credential is returned.
  return res.status(503).json({ error: 'BROWSER_GATEWAY_UNAVAILABLE' });
}

function publicStart(input: string) {
  try {
    const url = publicHttpsUrl(input);
    // Persist the target, never session-bearing query parameters or fragments.
    return url.origin + url.pathname;
  } catch {
    throw new BrowserRequestError(400, 'BROWSER_TARGET_DENIED');
  }
}

function browserTask(goal: string): ExecutableTaskNode {
  return {
    id: 'browser-1', objective: goal, operationType: 'browser_automation', requiredCapabilities: ['browser_automation'],
    selectedRuntime: 'local_chrome', selectedProvider: 'zurelay', selectedModel: MODEL, requiredContextReferences: [],
    allowedFiles: [], expectedOutputSchema: {}, dependencies: [], riskLevel: 'medium', timeoutMs: RUN_MS,
    retryPolicy: { maximumAttempts: 1, initialBackoffMs: 0, maximumBackoffMs: 0 },
    budget: { maximumUsd: limits.maxModelCostMicros / 1_000_000 }, validationMethod: ['local_browser_receipt'],
    evidenceRequirements: ['local_browser_receipt'], fallbackRoutes: [], status: 'pending', attempts: 0, evidence: [],
  };
}

function localRecord(row: BrowserRunRecord | null, owner: string) {
  if (!row || row.tenantId !== owner || row.userId !== owner || row.projectKey !== `user:${owner}`
      || row.spec.executionTarget !== 'local_chrome' || row.state.tasks[0]?.selectedRuntime !== 'local_chrome') {
    throw new BrowserRequestError(404, 'BROWSER_RUN_NOT_FOUND');
  }
  return row;
}

function active(record: BrowserRunRecord) {
  if (record.cancelRequested || isTerminalRunStatus(record.status) || Date.now() - Date.parse(record.state.createdAt) >= RUN_MS) {
    throw new BrowserRequestError(409, 'BROWSER_RUN_INACTIVE');
  }
}

export function createLocalBrowserRouter(resolve = configured, dispatch = dispatchBrowserModel) {
  const router = Router();
  const route = (handler: (req: AuthRequest, res: Response, runtime: Runtime) => Promise<unknown>) =>
    async (req: AuthRequest, res: Response) => {
      res.set('Cache-Control', 'no-store');
      try {
        const rt = resolve();
        if (!rt) throw new BrowserRequestError(503, 'LOCAL_BROWSER_DISABLED');
        return await handler(req, res, rt);
      } catch (error) { return sendError(res, error); }
    };

  router.post('/runs', route(async (req, res, { runs, leases }) => {
    const ctx = requireTenantContext(req.tenantContext);
    const data = startBody.parse(req.body);
    checkData(data);
    const startUrl = publicStart(data.startUrl);
    const lease = await leases.acquire({ tenantId: ctx.tenantId, runId: ctx.userId, taskId: 'local-chrome-admission' }, `chrome-api-${randomUUID()}`, 10_000);
    if (!lease) throw new BrowserRequestError(429, 'BROWSER_ADMISSION_BUSY');
    try {
      if (await runs.countActive(ctx.tenantId) >= 4) throw new BrowserRequestError(429, 'BROWSER_RUN_LIMIT');
      const state = createCanonicalExecutionState({
        projectId: `user:${ctx.userId}`, requiredCapabilities: ['browser_automation'], tasks: [browserTask(data.goal)],
      });
      await runs.create({ tenantId: ctx.tenantId, userId: ctx.userId, state, spec: {
        executionTarget: 'local_chrome', goal: data.goal, startUrl, allowedOrigins: [new URL(startUrl).origin],
        limits, plan: null, driveProject: null,
      } });
      return res.status(201).json({ runId: state.runId, maxTurns: MAX_TURNS });
    } finally {
      await leases.release(lease).catch(() => undefined);
    }
  }));

  router.get('/session', route(async (req, res) => {
    const ctx = requireTenantContext(req.tenantContext);
    return res.json({ account: ctx.userId });
  }));

  router.get('/runs/:runId', route(async (req, res, { runs }) => {
    const ctx = requireTenantContext(req.tenantContext);
    const row = localRecord(await runs.load(ctx.userId, id.parse(req.params.runId)), ctx.userId);
    const task = row.state.tasks[0]!;
    const expired = !isTerminalRunStatus(row.status) && Date.now() - Date.parse(row.state.createdAt) >= RUN_MS;
    return res.json({ runId: row.runId, status: expired ? 'interrupted' : row.status, turns: row.state.productManifest.localBrowserTurn ?? 0,
      cancelRequested: row.cancelRequested, result: task.output ?? null, evidence: task.evidence });
  }));

  router.delete('/runs/:runId', route(async (req, res, { runs }) => {
    const ctx = requireTenantContext(req.tenantContext);
    const row = localRecord(await runs.load(ctx.userId, id.parse(req.params.runId)), ctx.userId);
    return res.json({ outcome: await runs.requestCancel(ctx.userId, row.runId) });
  }));

  const withLease = (handler: (req: AuthRequest, res: Response, rt: Runtime, record: BrowserRunRecord, lease: Lease) => Promise<unknown>) =>
    route(async (req, res, rt) => {
      const ctx = requireTenantContext(req.tenantContext);
      const runId = id.parse(req.params.runId);
      localRecord(await rt.runs.load(ctx.userId, runId), ctx.userId);
      const lease = await rt.leases.acquire({ tenantId: ctx.tenantId, runId, taskId: 'execute' }, `chrome-api-${randomUUID()}`, 100_000);
      if (!lease) throw new BrowserRequestError(409, 'BROWSER_RUN_BUSY');
      try {
        return await handler(req, res, rt, localRecord(await rt.runs.load(ctx.userId, runId), ctx.userId), lease);
      } finally {
        await rt.leases.release(lease).catch(() => undefined);
      }
    });

  router.post('/runs/:runId/turn', withLease(async (req, res, rt, row, lease) => {
    active(row);
    const ctx = requireTenantContext(req.tenantContext);
    const { turn, ...body } = turnBody.parse(req.body);
    checkData(body.messages);
    const requestBytes = Buffer.byteLength(JSON.stringify(body));
    if (requestBytes > 96_000) throw new BrowserRequestError(400, 'BROWSER_CONTEXT_TOO_LARGE');
    if (turn !== Number(row.state.productManifest.localBrowserTurn ?? 0) + 1) {
      throw new BrowserRequestError(409, 'BROWSER_TURN_REPLAY');
    }
    const task = row.state.tasks[0]!;
    task.status = 'running';
    task.startedAt ??= new Date().toISOString();
    task.attempts = 1;
    row.state.productManifest.localBrowserTurn = turn;
    row.state.updatedAt = new Date().toISOString();
    await rt.runs.stateStore(ctx.userId, () => lease).save(row.state);

    const job = parseBrowserJob({ version: 1, userId: ctx.userId, tenantId: ctx.tenantId, projectId: row.projectKey,
      runId: row.runId, taskId: task.id, attempt: 1, startUrl: row.spec.startUrl, allowedOrigins: row.spec.allowedOrigins, limits });
    const revalidate = async () => {
      await rt.leases.assertCurrent(lease);
      active(localRecord(await rt.runs.load(ctx.userId, row.runId), ctx.userId));
    };
    const abort = new AbortController();
    const disconnect = () => { if (!res.writableFinished) abort.abort(); };
    res.once('close', disconnect);
    const timer = setInterval(() => void revalidate().catch(() => abort.abort()), 1_000);
    const digest = createHash('sha256').update(`local-browser:${row.runId}:${turn}`).digest('hex');
    try {
      const result = await dispatch({ job, authority: { context: ctx, revalidate },
        modelId: MODEL, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(80_000)]),
        body: { ...body, stream: false, reasoning_effort: 'none', max_tokens: body.max_tokens ?? 2_048 },
        estimatedInputTokens: Math.ceil(requestBytes / 3),
        maximumOutputTokens: body.max_tokens ?? 2_048, platformCostCeiling: TURN_CEILING_MICROS,
        idempotencyKey: `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`,
      });
      const choice = result.choices?.[0];
      if (!choice?.message) throw new BrowserRequestError(502, 'BROWSER_MODEL_EMPTY');
      return res.json({ id: result.id, model: MODEL, choice: { finish_reason: choice.finish_reason,
        message: { content: choice.message.content, tool_calls: choice.message.tool_calls } }, usage: result.usage });
    } finally {
      clearInterval(timer);
      res.off('close', disconnect);
    }
  }));

  router.post('/runs/:runId/finish', withLease(async (req, res, { runs }, row, lease) => {
    const data = endBody.parse(req.body);
    checkData(data);
    if (isTerminalRunStatus(row.status)) return res.json({ status: row.status });
    if (data.status === 'completed') {
      active(row);
      if (!data.actions.length || !data.result?.trim() || !row.state.productManifest.localBrowserTurn) {
        throw new BrowserRequestError(400, 'BROWSER_RESULT_UNVERIFIED');
      }
    }
    const task = row.state.tasks[0]!;
    task.status = row.cancelRequested ? 'cancelled' : data.status;
    task.completedAt = new Date().toISOString();
    row.state.updatedAt = task.completedAt;
    if (task.status === 'completed') task.output = { source: 'local_chrome', text: data.result ?? '' };
    task.evidence = data.actions.map(action => ({
      id: randomUUID(), kind: 'local_browser_receipt', summary: action, timestamp: task.completedAt!,
    }));
    await runs.stateStore(row.userId, () => lease).save(row.state);
    return res.json({ status: task.status });
  }));

  return router;
}

export default createLocalBrowserRouter();
