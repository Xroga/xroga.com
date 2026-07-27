import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { GrowthService, GrowthServiceError } from '../growth/growthService.js';

const router = Router();
const service = new GrowthService();
const uuid = z.string().uuid();
const project = z.object({ projectId: uuid });

function parse<T>(schema: z.ZodType<T>, value: unknown, res: Response): T | null {
  const result = schema.safeParse(value);
  if (!result.success) { res.status(400).json({ error: 'Invalid growth request', code: 'invalid_request', fields: result.error.flatten() }); return null; }
  return result.data;
}
function error(res: Response, value: unknown): void {
  const correlationId = randomUUID();
  if (value instanceof GrowthServiceError) { res.status(value.statusCode).json({ error: value.message, code: value.code, correlationId }); return; }
  console.error('[growth]', correlationId, value instanceof Error ? value.message : 'unknown');
  res.status(500).json({ error: 'Growth request failed', code: 'growth_failed', correlationId });
}

router.get('/overview', async (req: AuthRequest, res) => {
  const input = parse(project, req.query, res); if (!input) return;
  try { res.json(await service.overview(req.userId!, input.projectId)); } catch (value) { error(res, value); }
});

router.post('/events', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, name: z.string().max(100), idempotencyKey: uuid, environment: z.enum(['test','preview','production']), anonymousId: z.string().max(160).optional(), sessionId: z.string().max(160).optional(), releaseId: z.string().max(160).optional(), deploymentId: uuid.optional(), campaignId: uuid.optional(), referralId: uuid.optional(), experimentId: uuid.optional(), consentState: z.enum(['granted','denied','unknown','not_required']), source: z.string().min(1).max(80), evidenceReference: z.string().min(3).max(500), metadata: z.record(z.unknown()).optional(), occurredAt: z.string().datetime().optional() }), req.body, res); if (!input) return;
  try { const result = await service.recordEvent(req.userId!, input); res.status(result.duplicate ? 200 : 201).json(result); } catch (value) { error(res, value); }
});

router.post('/identities/link', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, anonymousId: z.string().min(8).max(160), evidenceReference: z.string().min(3).max(500) }), req.body, res); if (!input) return;
  try { res.status(201).json({ identity: await service.linkIdentity(req.userId!, input) }); } catch (value) { error(res, value); }
});

router.post('/activation/definitions', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, name: z.string().min(3).max(120), version: z.number().int().min(1), requiredEvents: z.array(z.string()).min(1).max(20) }), req.body, res); if (!input) return;
  try { res.status(201).json({ definition: await service.defineActivation(req.userId!, input) }); } catch (value) { error(res, value); }
});

router.post('/activation/evaluate', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, subjectUserId: uuid.optional() }), req.body, res); if (!input) return;
  try { res.json(await service.evaluateActivation(req.userId!, input.projectId, input.subjectUserId)); } catch (value) { error(res, value); }
});

router.post('/recommendations/evaluate', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, consent: z.boolean() }), req.body, res); if (!input) return;
  try { res.status(201).json({ recommendation: await service.recommend(req.userId!, input) }); } catch (value) { error(res, value); }
});

router.post('/lifecycle/transition', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, subjectType: z.enum(['user','product']), subjectId: uuid, state: z.enum(['defined','onboarding','activated','launched','retained','at_risk','reactivated','paused','blocked']), evidenceReference: z.string().min(3).max(500) }), req.body, res); if (!input) return;
  try { res.status(201).json({ lifecycle: await service.transitionLifecycle(req.userId!, input) }); } catch (value) { error(res, value); }
});

router.post('/suppressions', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, channel: z.enum(['email','in_app']), address: z.string().min(3).max(320), reason: z.enum(['unsubscribed','bounced','complained','manual','consent_denied']), evidenceReference: z.string().min(3).max(500) }), req.body, res); if (!input) return;
  try { res.status(201).json({ suppression: await service.suppress(req.userId!, input) }); } catch (value) { error(res, value); }
});

router.post('/attribution', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, anonymousId: z.string().max(160).optional(), touchType: z.enum(['first','recent','utm','referral','unknown']), source: z.string().max(120).optional(), medium: z.string().max(120).optional(), campaign: z.string().max(120).optional(), evidenceReference: z.string().min(3).max(500) }), req.body, res); if (!input) return;
  try { res.status(201).json({ attribution: await service.recordAttribution(req.userId!, input) }); } catch (value) { error(res, value); }
});

router.post('/segments', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, name: z.string().min(3).max(120), lifecycleStates: z.array(z.enum(['defined','onboarding','activated','launched','retained','at_risk','reactivated','paused','blocked'])).min(1) }), req.body, res); if (!input) return;
  try { res.status(201).json({ segment: await service.createSegment(req.userId!, input) }); } catch (value) { error(res, value); }
});

router.post('/campaigns', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, segmentId: uuid, name: z.string().min(3).max(120), channel: z.enum(['email','in_app']), templateKey: z.string().regex(/^[a-z0-9][a-z0-9_.-]{2,79}$/), idempotencyKey: uuid }), req.body, res); if (!input) return;
  try { res.status(201).json(await service.createCampaign(req.userId!, input)); } catch (value) { error(res, value); }
});

router.post('/campaigns/:campaignId/process', async (req: AuthRequest, res) => {
  const input = parse(z.object({ campaignId: uuid }), req.params, res); if (!input) return;
  try { res.json(await service.processCampaign(req.userId!, input.campaignId)); } catch (value) { error(res, value); }
});

router.post('/experiments', async (req: AuthRequest, res) => {
  const input = parse(z.object({ projectId: uuid, key: z.string().regex(/^[a-z0-9][a-z0-9_.-]{2,79}$/), seed: z.string().min(8).max(160), variants: z.array(z.object({ key: z.string().min(1).max(40), weight: z.number().positive().max(10000) })).min(2).max(10), minimumSampleSize: z.number().int().min(10).max(1000000) }), req.body, res); if (!input) return;
  try { res.status(201).json({ experiment: await service.createExperiment(req.userId!, input) }); } catch (value) { error(res, value); }
});

router.post('/experiments/:experimentId/assign', async (req: AuthRequest, res) => {
  const params = parse(z.object({ experimentId: uuid }), req.params, res); const body = parse(z.object({ subjectKey: z.string().min(3).max(160) }), req.body, res); if (!params || !body) return;
  try { res.status(201).json({ assignment: await service.assignExperiment(req.userId!, params.experimentId, body.subjectKey) }); } catch (value) { error(res, value); }
});

router.post('/experiments/assignments/:assignmentId/expose', async (req: AuthRequest, res) => {
  const params = parse(z.object({ assignmentId: uuid }), req.params, res); const body = parse(z.object({ evidenceReference: z.string().min(3).max(500) }), req.body, res); if (!params || !body) return;
  try { res.json({ assignment: await service.exposeExperiment(req.userId!, params.assignmentId, body.evidenceReference) }); } catch (value) { error(res, value); }
});

router.post('/experiments/:experimentId/outcomes', async (req: AuthRequest, res) => {
  const params = parse(z.object({ experimentId: uuid }), req.params, res); const body = parse(z.object({ assignmentId: uuid, eventId: uuid, metricKey: z.string().regex(/^[a-z0-9][a-z0-9_.-]{1,79}$/) }), req.body, res); if (!params || !body) return;
  try { res.status(201).json({ outcome: await service.recordExperimentOutcome(req.userId!, { experimentId: params.experimentId, ...body }) }); } catch (value) { error(res, value); }
});

router.get('/experiments/:experimentId/result', async (req: AuthRequest, res) => {
  const input = parse(z.object({ experimentId: uuid }), req.params, res); if (!input) return;
  try { res.json(await service.experimentResult(req.userId!, input.experimentId)); } catch (value) { error(res, value); }
});

export default router;
