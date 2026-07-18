import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { runChatPipeline } from '../ai/pipeline.js';
import {
  assertHasQuota,
  getUsage,
  usageToTokenUsage,
} from '../ai/quota.js';
import {
  MONTHLY_TOTAL_BUDGET_USD,
  MONTHLY_TOTAL_TOKENS,
  MONTHLY_USER_PRICE_USD,
  MODELS,
  dashboardModelPools,
} from '../ai/models.js';
import { modelKeyStatus } from '../ai/openaiCompat.js';

const router = Router();

function requireUserId(req: AuthRequest): string | null {
  return req.userId || (typeof req.body?.userId === 'string' ? req.body.userId : null);
}

/**
 * POST /api/phase1/chat — light lane (Converter not required; chat / research Q&A).
 * Build prompts return 409 USE_BUILD_PIPELINE so the client uses /api/swarm/execute.
 */
router.post('/chat', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Sign in required', code: 'UNAUTHORIZED' });
  }

  const message =
    (typeof req.body?.message === 'string' && req.body.message) ||
    (typeof req.body?.prompt === 'string' && req.body.prompt) ||
    '';
  if (!message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const history = Array.isArray(req.body?.history)
    ? (req.body.history as Array<{ role: 'user' | 'assistant'; content: string }>)
    : [];

  try {
    const result = await runChatPipeline({ userId, prompt: message.trim(), history });
    return res.json({
      response: result.response,
      intent: result.intent,
      usage: result.usage,
      webSources: result.webSources,
      modelId: result.modelId,
      modelLabel: MODELS[result.modelId].label,
    });
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'USE_BUILD_PIPELINE' || e.message === 'USE_BUILD_PIPELINE') {
      return res.status(409).json({
        error: 'This looks like a build request — use the workspace build pipeline.',
        code: 'USE_BUILD_PIPELINE',
      });
    }
    if (e.code === 'OUT_OF_TOKENS') {
      return res.status(402).json({
        error: e.message,
        code: 'OUT_OF_ACTIONS',
        paymentLink: '/pricing',
      });
    }
    console.error('[phase1/chat]', e);
    return res.status(500).json({ error: e.message || 'Chat failed', code: 'CHAT_FAILED' });
  }
});

router.get('/usage', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Sign in required', code: 'UNAUTHORIZED' });
  }
  try {
    const usage = await getUsage(userId);
    return res.json({ usage: usageToTokenUsage(usage), byModel: usage.byModel });
  } catch (err) {
    console.error('[phase1/usage]', err);
    return res.status(500).json({ error: 'Failed to load usage' });
  }
});

router.get('/economics', (_req, res) => {
  const pools = dashboardModelPools();
  res.json({
    currency: 'USD',
    freeUserMonthlyTokens: MONTHLY_TOTAL_TOKENS,
    freeUserWorstCaseApiUsd: MONTHLY_TOTAL_BUDGET_USD,
    userChargeUsd: MONTHLY_USER_PRICE_USD,
    profitPerUserUsd: Math.round((MONTHLY_USER_PRICE_USD - MONTHLY_TOTAL_BUDGET_USD) * 100) / 100,
    marginPct: Math.round(((MONTHLY_USER_PRICE_USD - MONTHLY_TOTAL_BUDGET_USD) / MONTHLY_USER_PRICE_USD) * 1000) / 10,
    modelStack: Object.values(MODELS).map((m) => ({
      id: m.id,
      label: m.label,
      tagline: m.tagline,
      budgetUsd: m.budgetUsd,
      monthlyTokens: m.monthlyTokens,
      role: m.role,
    })),
    pools,
    perBuild: [
      {
        tier: 'simple',
        label: 'Simple web app',
        totalTokens: 20_000,
        totalUsd: 0.11,
        buildsPerFreeMonth: 50,
        howAi: 'OpenRouter DeepSeek V4 Pro / Converter → Builder',
      },
      {
        tier: 'medium',
        label: 'Medium full-stack app',
        totalTokens: 150_000,
        totalUsd: 0.81,
        buildsPerFreeMonth: 6,
        howAi: 'Kimi K3 or GLM-5.2 via Converter',
      },
      {
        tier: 'complex',
        label: 'Complex game / crypto platform',
        totalTokens: 600_000,
        totalUsd: 3.24,
        buildsPerFreeMonth: 2,
        howAi: 'Kimi K3 flagship + research when needed',
      },
    ],
    planProfitIfFullTokenBurn: [
      {
        tier: 'spark',
        priceUsd: MONTHLY_USER_PRICE_USD,
        tokens: MONTHLY_TOTAL_TOKENS,
        apiCostIfFullBurnUsd: MONTHLY_TOTAL_BUDGET_USD,
        grossProfitUsd: Math.round((MONTHLY_USER_PRICE_USD - MONTHLY_TOTAL_BUDGET_USD) * 100) / 100,
        marginPct: Math.round(((MONTHLY_USER_PRICE_USD - MONTHLY_TOTAL_BUDGET_USD) / MONTHLY_USER_PRICE_USD) * 1000) / 10,
      },
    ],
    keysConfigured: modelKeyStatus(),
  });
});

router.post('/emergency-tokens', (_req, res) => {
  res.status(410).json({
    success: false,
    message: 'Emergency token grants are not part of the new AI quota system.',
    code: 'NOT_SUPPORTED',
  });
});

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    aiBackend: 'kimi-glm-deepseek-grok',
    keys: modelKeyStatus(),
  });
});

/** Dev helper — assert quota without spending */
router.get('/quota-check', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  try {
    const usage = await assertHasQuota(userId);
    res.json({ ok: true, usage: usageToTokenUsage(usage) });
  } catch (err) {
    const e = err as Error & { code?: string };
    res.status(402).json({ ok: false, error: e.message, code: e.code });
  }
});

export default router;
