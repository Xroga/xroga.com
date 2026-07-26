import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import { isQueueSystemReady } from '../config/jobQueues.js';
import { computePlatformReady } from '../lib/platformReady.js';
import type { AuthRequest } from '../middleware/auth.js';
import { OperationsService, OperationsServiceError } from '../operations/operationsService.js';
import { evaluateReadiness, safeConfigurationStatus, type ReadinessCheck } from '../operations/productionOperations.js';

const router = Router();
const service = new OperationsService();
const projectIdSchema = z.string().uuid();
const listSchema = z.object({ projectId: projectIdSchema, limit: z.coerce.number().int().min(1).max(200).default(100) });
const actionSchema = z.object({
  projectId: projectIdSchema,
  environmentId: z.string().uuid().optional(),
  actionType: z.string().min(1).max(80),
  targetType: z.string().min(1).max(80),
  targetId: z.string().min(1).max(240),
  targetVersion: z.number().int().min(0),
  idempotencyKey: z.string().uuid(),
  confirmed: z.boolean().default(false),
  parameters: z.record(z.unknown()).optional(),
});

function userId(req: AuthRequest): string { return req.userId!; }

function sendError(res: Response, error: unknown): void {
  const correlationId = randomUUID();
  if (error instanceof OperationsServiceError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code, correlationId });
    return;
  }
  console.error('[operations]', correlationId, error instanceof Error ? error.message : 'unknown error');
  res.status(500).json({ error: 'Operations request failed', code: 'operations_failed', correlationId });
}

function parseOrSend<T>(schema: z.ZodType<T>, value: unknown, res: Response): T | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid operations request', code: 'invalid_request', fields: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}

function currentChecks(): ReadinessCheck[] {
  const platform = computePlatformReady();
  const configured = new Map(safeConfigurationStatus(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FRONTEND_URL']).map((item) => [item.key, item.configured]));
  return [
    { id: 'platform_configuration', required: true, status: platform.ready ? 'verified' : 'blocked', blocker: platform.ready ? undefined : `${platform.requiredTotal - platform.requiredOk} required configuration checks are missing` },
    { id: 'database_configuration', required: true, status: configured.get('SUPABASE_URL') && configured.get('SUPABASE_SERVICE_ROLE_KEY') ? 'verified' : 'blocked', blocker: 'database credentials are not configured' },
    { id: 'queue_runtime', required: false, status: isQueueSystemReady() ? 'verified' : 'unknown', blocker: 'queue provider is not configured' },
    { id: 'production_deployment', required: true, status: 'unknown', blocker: 'no current deployment evidence has been loaded' },
  ];
}

router.get('/readiness', async (_req, res) => {
  const checks = currentChecks();
  try {
    const { data, error } = await getSupabaseAdmin().from('production_evidence').select('id,kind,status,summary,reference,observed_at').order('observed_at', { ascending: false }).limit(50);
    if (error) throw error;
    const deployment = data?.find((item) => item.kind === 'deployment_verification');
    if (deployment) {
      const index = checks.findIndex((check) => check.id === 'production_deployment');
      checks[index] = { id: 'production_deployment', required: true, status: deployment.status, evidenceId: deployment.id, blocker: deployment.status === 'verified' ? undefined : deployment.summary };
    }
    res.json({ readiness: evaluateReadiness(checks), evidence: data ?? [] });
  } catch {
    res.status(503).json({ readiness: evaluateReadiness(checks), evidence: [], blocker: 'Operational evidence store is unavailable or its migration is not applied' });
  }
});

router.get('/portfolio', async (req: AuthRequest, res) => {
  const query = parseOrSend(z.object({ search: z.string().max(100).optional(), status: z.string().max(40).optional(), type: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).default(0) }), req.query, res);
  if (!query) return;
  try { res.json(await service.portfolio(userId(req), { ...query, limit: query.limit ?? 30, offset: query.offset ?? 0 })); } catch (error) { sendError(res, error); }
});

router.get('/products/:projectId', async (req: AuthRequest, res) => {
  const projectId = parseOrSend(projectIdSchema, req.params.projectId, res); if (!projectId) return;
  try { res.json(await service.product(userId(req), projectId)); } catch (error) { sendError(res, error); }
});

router.get('/resources', async (req: AuthRequest, res) => {
  const query = parseOrSend(z.object({ projectId: projectIdSchema, kind: z.string().max(60).optional(), environmentId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(100), offset: z.coerce.number().int().min(0).default(0) }), req.query, res); if (!query) return;
  try { res.json(await service.resources(userId(req), query.projectId, { ...query, limit: query.limit ?? 100, offset: query.offset ?? 0 })); } catch (error) { sendError(res, error); }
});

router.get('/configuration', async (req: AuthRequest, res) => {
  const query = parseOrSend(z.object({ projectId: projectIdSchema }), req.query, res); if (!query) return;
  try { res.json({ configuration: await service.configuration(userId(req), query.projectId) }); } catch (error) { sendError(res, error); }
});

router.get('/slo', async (req: AuthRequest, res) => {
  const query = parseOrSend(z.object({ projectId: projectIdSchema }), req.query, res); if (!query) return;
  try { res.json({ snapshots: await service.slo(userId(req), query.projectId) }); } catch (error) { sendError(res, error); }
});

router.get('/providers', (_req, res) => res.json({ providers: service.providerContracts() }));

router.get('/actions', async (req: AuthRequest, res) => {
  const query = parseOrSend(z.object({ projectId: projectIdSchema }), req.query, res); if (!query) return;
  try { res.json({ actions: await service.listActions(userId(req), query.projectId) }); } catch (error) { sendError(res, error); }
});

router.post('/actions', async (req: AuthRequest, res) => {
  const input = parseOrSend(actionSchema, req.body, res); if (!input) return;
  try { res.status(201).json({ action: await service.createAction(userId(req), { ...input, confirmed: input.confirmed ?? false }) }); } catch (error) { sendError(res, error); }
});

router.post('/actions/:actionId/approve', async (req: AuthRequest, res) => {
  const params = parseOrSend(z.object({ actionId: z.string().uuid() }), req.params, res);
  const body = parseOrSend(z.object({ decision: z.enum(['approved','rejected']), reason: z.string().min(3).max(500) }), req.body, res);
  if (!params || !body) return;
  try { res.json({ approval: await service.approveAction(userId(req), params.actionId, body.decision, body.reason) }); } catch (error) { sendError(res, error); }
});

router.post('/actions/:actionId/confirm', async (req: AuthRequest, res) => {
  const params = parseOrSend(z.object({ actionId: z.string().uuid() }), req.params, res); if (!params) return;
  try { res.json({ action: await service.confirmAction(userId(req), params.actionId) }); } catch (error) { sendError(res, error); }
});

router.post('/actions/:actionId/execute', async (req: AuthRequest, res) => {
  const params = parseOrSend(z.object({ actionId: z.string().uuid() }), req.params, res); if (!params) return;
  try { res.json({ action: await service.executeAction(userId(req), params.actionId) }); } catch (error) { sendError(res, error); }
});

router.get('/automation', async (req: AuthRequest, res) => {
  const query = parseOrSend(z.object({ projectId: projectIdSchema }), req.query, res); if (!query) return;
  try { res.json(await service.automation(userId(req), query.projectId)); } catch (error) { sendError(res, error); }
});

router.post('/automation/rules', async (req: AuthRequest, res) => {
  const input = parseOrSend(z.object({ projectId: projectIdSchema, ruleKey: z.string().regex(/^[a-z0-9][a-z0-9_.-]{2,79}$/), name: z.string().min(3).max(120), triggerType: z.string().min(2).max(80), riskLevel: z.enum(['read_only','low','medium','high','critical']), actionType: z.string().min(2).max(80), conditions: z.record(z.unknown()).default({}), exclusions: z.record(z.unknown()).default({}), maxRuns: z.number().int().min(1).max(20).default(3), windowSeconds: z.number().int().min(60).max(86_400).default(3600), enabled: z.boolean().default(false) }), req.body, res); if (!input) return;
  try { res.status(201).json({ rule: await service.createAutomationRule(userId(req), input.projectId, { ...input, conditions: input.conditions ?? {}, exclusions: input.exclusions ?? {}, maxRuns: input.maxRuns ?? 3, windowSeconds: input.windowSeconds ?? 3600, enabled: input.enabled ?? false }) }); } catch (error) { sendError(res, error); }
});

router.post('/automation/signals', async (req: AuthRequest, res) => {
  const input = parseOrSend(z.object({ projectId: projectIdSchema, triggerType: z.string().min(2).max(80), triggerId: z.string().min(1).max(200), targetType: z.string().min(1).max(80), targetId: z.string().min(1).max(240), targetVersion: z.number().int().min(0), environmentId: z.string().uuid().optional(), attributes: z.record(z.union([z.string(),z.number(),z.boolean(),z.null()])).default({}), evidenceReference: z.string().max(500).optional() }), req.body, res); if (!input) return;
  try { res.status(202).json({ runs: await service.evaluateAutomationSignal(userId(req), input.projectId, { ...input, attributes: input.attributes ?? {} }) }); } catch (error) { sendError(res, error); }
});

router.get('/audit', async (req: AuthRequest, res) => {
  const query = parseOrSend(listSchema, req.query, res); if (!query) return;
  try { res.json({ events: await service.listAudit(userId(req), query.projectId, query.limit ?? 100) }); } catch (error) { sendError(res, error); }
});

router.get('/evidence', async (req: AuthRequest, res) => {
  const query = parseOrSend(listSchema, req.query, res); if (!query) return;
  try { res.json({ evidence: await service.listEvidence(userId(req), query.projectId, query.limit ?? 100) }); } catch (error) { sendError(res, error); }
});

export default router;
