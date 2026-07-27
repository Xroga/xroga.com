import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { runChatPipeline } from '../ai/pipeline.js';
import { assertHasQuota, getUsage, usageToTokenUsage } from '../ai/quota.js';
import { MONTHLY_USER_PRICE_USD } from '../ai/models.js';
import { getProviderEntitlementStatus } from '../ai/providerBudget.js';

const router = Router();

function requireUserId(req: AuthRequest): string | null {
  return req.userId || (typeof req.body?.userId === 'string' ? req.body.userId : null);
}

/** Chat and research lane. Build requests are redirected to the durable workspace pipeline. */
router.post('/chat', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required', code: 'UNAUTHORIZED' });

  const message =
    (typeof req.body?.message === 'string' && req.body.message) ||
    (typeof req.body?.prompt === 'string' && req.body.prompt) ||
    '';
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : undefined;
  if (!message.trim() && !(attachments && attachments.length)) {
    return res.status(400).json({ error: 'message or attachments required' });
  }
  const history = Array.isArray(req.body?.history)
    ? (req.body.history as Array<{ role: 'user' | 'assistant'; content: string }>)
    : [];

  try {
    const result = await runChatPipeline({ userId, prompt: message.trim(), history, attachments });
    return res.json({
      response: result.response,
      intent: result.intent,
      usage: result.usage,
      webSources: result.webSources,
      engine: 'xroga',
    });
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'USE_BUILD_PIPELINE' || error.message === 'USE_BUILD_PIPELINE') {
      return res.status(409).json({
        error: 'This looks like a build request - use the workspace build pipeline.',
        code: 'USE_BUILD_PIPELINE',
      });
    }
    if (['OUT_OF_TOKENS', 'MODEL_CAP_REACHED', 'PAID_PROVIDER_CAPACITY_UNAVAILABLE'].includes(error.code ?? '')) {
      return res.status(402).json({
        error: error.message,
        code: 'CAPACITY_UNAVAILABLE',
        paymentLink: '/pricing',
      });
    }
    console.error('[phase1/chat]', { code: error.code ?? 'CHAT_FAILED', message: error.message });
    return res.status(500).json({ error: 'Chat is temporarily unavailable', code: 'CHAT_FAILED' });
  }
});

router.get('/usage', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required', code: 'UNAUTHORIZED' });
  try {
    const usage = await getUsage(userId);
    return res.json({ usage: usageToTokenUsage(usage) });
  } catch (err) {
    console.error('[phase1/usage]', { category: 'usage_read_failed' });
    return res.status(500).json({ error: 'Failed to load usage' });
  }
});

/** Customer-safe plan information. Internal provider economics are never returned. */
router.get('/economics', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  try {
    res.json({
      plan: 'Xroga AI',
      price: `$${MONTHLY_USER_PRICE_USD} per 30 days`,
      entitlement: await getProviderEntitlementStatus(userId),
    });
  } catch {
    res.status(503).json({ error: 'Plan capacity is temporarily unavailable', code: 'BILLING_UNAVAILABLE' });
  }
});

router.post('/emergency-tokens', (_req, res) => {
  res.status(410).json({
    success: false,
    message: 'Emergency capacity grants are not available on the current plan.',
    code: 'NOT_SUPPORTED',
  });
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'xroga-ai' });
});

/** Non-mutating quota preflight used by the workspace. */
router.get('/quota-check', async (req: AuthRequest, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  try {
    const usage = await assertHasQuota(userId);
    res.json({ ok: true, usage: usageToTokenUsage(usage) });
  } catch (err) {
    const error = err as Error & { code?: string };
    res.status(402).json({ ok: false, error: error.message, code: error.code });
  }
});

export default router;
