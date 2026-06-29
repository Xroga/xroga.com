import { Router } from 'express';
import { z } from 'zod';
import { buildArchitectDAG, formatDuration } from '../orchestrator/architectDAG.js';
import { matchFeatureByKeywords, FEATURE_CATALOG } from '../config/featureCatalog.js';
import { classifyFeature, computeFeatureActionCost } from '../services/architect/featureRouter.js';
import { initSSE, sendSSE, endSSE } from '../lib/sse.js';
import { SwarmService } from '../services/SwarmService.js';
import { InsufficientActionsError } from '../errors/InsufficientActionsError.js';
import { sanitizeSwarmSsePayload } from '../lib/sanitizeUserResponse.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

const estimateSchema = z.object({
  prompt: z.string().min(1).max(10000),
});

router.post('/estimate', async (req: AuthRequest, res) => {
  const parsed = estimateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.json({ estimatedActions: 1, estimatedTime: '5s', featureId: 'chat' });
    return;
  }

  const { prompt } = parsed.data;
  const catalogMatch = matchFeatureByKeywords(prompt);
  const route = await classifyFeature(prompt).catch(() => null);
  const plan = await buildArchitectDAG(prompt, { featureId: catalogMatch?.id });

  const baseCost = catalogMatch?.actionCost ?? (route ? computeFeatureActionCost(route.category, prompt) : 1);
  const dagMultiplier = Math.max(1, Math.ceil(plan.dag.length / 3));
  const estimatedActions = Math.max(1, baseCost * dagMultiplier);
  const estimatedTime = formatDuration(plan.estimatedDurationSeconds);

  res.json({
    estimatedActions,
    estimatedTime,
    featureId: catalogMatch?.id ?? route?.category ?? 'chat',
    featureName: catalogMatch?.name ?? route?.category ?? 'Chat',
    analysis: plan.analysis,
    dagSteps: plan.dag.length,
  });
});

router.get('/features', (_req, res) => {
  res.json({
    total: FEATURE_CATALOG.length,
    categories: [...new Set(FEATURE_CATALOG.map((f) => f.category))],
    features: FEATURE_CATALOG.map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      agent: f.agent,
      promptTemplate: f.promptTemplate,
      actionCost: f.actionCost,
    })),
  });
});

const SAFE_COMMANDS = new Set(['help', 'clear', 'status', 'deploy', 'pwd', 'echo']);

router.post('/terminal', async (req: AuthRequest, res) => {
  const command = String(req.body?.command ?? '').trim();
  if (!command) {
    res.json({ output: 'No command provided.' });
    return;
  }
  const base = command.split(/\s+/)[0].toLowerCase();
  if (!SAFE_COMMANDS.has(base) && !command.toLowerCase().startsWith('echo ')) {
    res.json({
      output: `Command "${base}" queued via Automation Runtime. Allowed: ${[...SAFE_COMMANDS].join(', ')}`,
    });
    return;
  }
  if (base === 'status') {
    res.json({ output: 'Swarm: online | Black Hole V∞ | All agents ready' });
    return;
  }
  if (base === 'deploy') {
    res.json({ output: 'Deploy pipeline triggered — check Automation hub for live URL.' });
    return;
  }
  if (command.toLowerCase().startsWith('echo ')) {
    res.json({ output: command.slice(5) });
    return;
  }
  res.json({ output: `Processed: ${command}` });
});

router.get('/swarm/stream', async (req: AuthRequest, res) => {
  const prompt = String(req.query.prompt ?? '');
  if (!prompt.trim()) {
    res.status(400).json({ error: 'prompt required' });
    return;
  }

  initSSE(res);
  sendSSE(res, { event: 'pipeline', data: { step: 'connect', message: '📡 Connecting to Swarm…' } });

  try {
    await SwarmService.runWithSSE(req.userId!, prompt, res);
    endSSE(res);
  } catch (err) {
    if (err instanceof InsufficientActionsError) {
      sendSSE(res, { event: 'error', data: err.toJSON() });
    } else {
      const payload = sanitizeSwarmSsePayload(err);
      sendSSE(res, { event: 'delta', data: { delta: payload.delta } });
      sendSSE(res, { event: 'complete', data: { success: true, output: { type: 'chat', content: payload.message } } });
    }
    res.end();
  }
});

export default router;
