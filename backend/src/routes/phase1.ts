import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { processMessage } from '../phase1/engine.js';
import { getUsage, claimEmergencyTokens } from '../phase1/tokenTracker.js';
import { getSecret, hasSecret } from '../config/envSecrets.js';
import { phase1Logger } from '../phase1/logger.js';
import {
  FREE_PLAN_TOKENS,
  quotaAllocationForPlan,
  estimateFullQuotaIntroUsd,
  isSonnet5IntroPricingActive,
} from '../config/modelRegistry.js';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(100_000),
  userId: z.string().uuid().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

function resolveUserId(req: AuthRequest): string | null {
  if (req.userId) return req.userId;
  const bodyUserId = typeof req.body?.userId === 'string' ? req.body.userId : null;
  if (bodyUserId && /^[0-9a-f-]{36}$/i.test(bodyUserId)) return bodyUserId;
  const headerUserId = req.headers['x-user-id'];
  if (typeof headerUserId === 'string' && /^[0-9a-f-]{36}$/i.test(headerUserId)) {
    return headerUserId;
  }
  return null;
}

/** Phase 1 health — provider key status (no secrets exposed) */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    phase: 1,
    service: 'xroga-phase1-engine',
    providers: {
      deepseek: hasSecret('DEEPSEEK_API_KEY'),
      grok: hasSecret('GROK_API_KEY') || hasSecret('XAI_API_KEY'),
      anthropic: hasSecret('ANTHROPIC_API_KEY'),
      gemini: hasSecret('GEMINI_API_KEY'),
    },
    quota: {
      monthlyTotalTokens: FREE_PLAN_TOKENS,
      inputTokens: Math.floor(FREE_PLAN_TOKENS * 0.67),
      outputTokens: FREE_PLAN_TOKENS - Math.floor(FREE_PLAN_TOKENS * 0.67),
      emergencyTokens: 250_000,
      modelMix: quotaAllocationForPlan(FREE_PLAN_TOKENS),
      introApiUsdIfFullPoolUsed: Math.round(estimateFullQuotaIntroUsd(FREE_PLAN_TOKENS) * 100) / 100,
      sonnet5IntroPricingActive: isSonnet5IntroPricingActive(),
    },
    rateLimit: '100 requests/minute/user',
    timestamp: new Date().toISOString(),
  });
});

/** GET /api/phase1/usage — token usage for current user */
router.get('/usage', async (req: AuthRequest, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(400).json({ error: 'userId required (auth token or X-User-Id header)', code: 'NO_USER' });
    return;
  }

  try {
    const usage = await getUsage(userId);
    res.json({ usage });
  } catch (err) {
    phase1Logger.error('Usage fetch failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch usage', code: 'USAGE_ERROR' });
  }
});

/** POST /api/phase1/emergency-tokens — claim 250K emergency tokens */
router.post('/emergency-tokens', async (req: AuthRequest, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(400).json({ error: 'userId required', code: 'NO_USER' });
    return;
  }

  try {
    const result = await claimEmergencyTokens(userId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    phase1Logger.error('Emergency tokens failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to claim emergency tokens', code: 'EMERGENCY_ERROR' });
  }
});

/**
 * POST /api/phase1/chat — Phase 1 AI engine
 * Accepts user messages, classifies intent, routes to models, tracks tokens.
 */
router.post('/chat', async (req: AuthRequest, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request body',
      code: 'VALIDATION_ERROR',
      details: parsed.error.flatten(),
    });
    return;
  }

  const userId = resolveUserId(req);
  if (!userId) {
    res.status(400).json({
      error: 'userId required via auth token, body.userId, or X-User-Id header',
      code: 'NO_USER',
    });
    return;
  }

  if (!getSecret('DEEPSEEK_API_KEY')) {
    res.status(503).json({
      error: 'AI engine not configured. DEEPSEEK_API_KEY required.',
      code: 'ENGINE_NOT_CONFIGURED',
    });
    return;
  }

  const result = await processMessage({
    message: parsed.data.message,
    userId,
    history: parsed.data.history,
  });

  if (!result.ok) {
    const headers: Record<string, string> = {};
    if (result.status === 429) {
      headers['Retry-After'] = '60';
    }
    res.status(result.status).set(headers).json(result.data);
    return;
  }

  res.json(result.data);
});

export default router;
