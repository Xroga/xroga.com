import {requireTenantContext} from '../security/tenantContext.js';
import { Router, type Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { canUserAccessComposioToolkit, listComposioTriggerTypes } from '../services/integrations/composioClient.js';
import {
  createBusinessAutomationRule,
  listBusinessAutomationEvents,
  listBusinessAutomationRules,
  setBusinessAutomationEnabled,
} from '../services/integrations/businessAutomations.js';

const router = Router();

router.get('/business-automations', async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ error: 'Sign in required.' });
  try {
    return res.json({ automations: await listBusinessAutomationRules(req.userId) });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : 'Automations unavailable.' });
  }
});

router.get('/business-automations/events', async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ error: 'Sign in required.' });
  try {
    return res.json({ events: await listBusinessAutomationEvents(req.userId) });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : 'Automation history unavailable.' });
  }
});

router.get('/business-automations/triggers', async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ error: 'Sign in required.' });
  const toolkit = String(req.query.toolkit ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(toolkit) || !canUserAccessComposioToolkit(req.userId, toolkit)) {
    return res.status(400).json({ error: 'Invalid app identifier.' });
  }
  try {
    const page = await listComposioTriggerTypes(toolkit, { limit: 100 },requireTenantContext(req.tenantContext));
    return res.json({ triggers: page.items, nextCursor: page.nextCursor ?? null });
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : 'App events could not be loaded.' });
  }
});

router.post('/business-automations', async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ error: 'Sign in required.' });
  const body = req.body as Record<string, unknown> | undefined;
  const schedule = body?.schedule as Record<string, unknown> | undefined;
  if (typeof body?.name !== 'string' || typeof body.request !== 'string' || !schedule) {
    return res.status(400).json({ error: 'Name, request, and schedule are required.' });
  }
  let typedSchedule: { kind: 'interval'; intervalSeconds: number } | { kind: 'trigger'; toolkit: string; triggerSlug: string; triggerConfig: Record<string, unknown> };
  if (schedule.kind === 'interval' && typeof schedule.intervalSeconds === 'number') {
    typedSchedule = { kind: 'interval', intervalSeconds: schedule.intervalSeconds };
  } else if (schedule.kind === 'trigger' && typeof schedule.toolkit === 'string' && typeof schedule.triggerSlug === 'string'
    && schedule.triggerConfig && typeof schedule.triggerConfig === 'object' && !Array.isArray(schedule.triggerConfig)) {
    typedSchedule = { kind: 'trigger', toolkit: schedule.toolkit, triggerSlug: schedule.triggerSlug, triggerConfig: schedule.triggerConfig as Record<string, unknown> };
  } else {
    return res.status(400).json({ error: 'Invalid interval or trigger configuration.' });
  }
  try {
    const automation = await createBusinessAutomationRule(req.userId, { name: body.name, request: body.request, schedule: typedSchedule },requireTenantContext(req.tenantContext));
    if('needsConfirmation' in automation)return res.status(202).json(automation);
    return res.status(201).json({ automation });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Automation could not be created.' });
  }
});

router.patch('/business-automations/:id', async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ error: 'Sign in required.' });
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean.' });
  try {
    const automation = await setBusinessAutomationEnabled(req.userId, String(req.params.id), req.body.enabled);
    return res.json({ automation });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Automation could not be changed.' });
  }
});

export default router;
